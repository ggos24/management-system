import React, { useRef, useEffect, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Bold, Italic, List, ListOrdered, CheckSquare, Link as LinkIcon, Strikethrough } from 'lucide-react';
import { Avatar } from './Avatar';
import { useViewportPortalPosition } from '../hooks/useViewportPortalPosition';
import { DESCRIPTION_MENTION_ATTR, getMentionToken } from '../lib/mentions';

/** A person the "@" picker can offer. */
export interface MentionCandidate {
  id: string;
  name: string;
  avatar?: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** People the "@" picker offers. Omit, or pass an empty list, to disable mentions. */
  mentionMembers?: MentionCandidate[];
}

/** Marks a checklist row. State lives in `data-checked` so it survives serialization. */
const CHECKLIST_ATTR = 'data-checklist';
const CHECKED_ATTR = 'data-checked';

const ALLOWED_TAGS = [
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'code',
  'pre',
  'p',
  'br',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'style'];

/** Block types that own their own line and must never be turned into a checklist row. */
const NON_ROW_HOSTS = /^(?:UL|OL|LI|H1|H2|H3|H4|H5|H6)$/;

// text-decoration is included because `data-checked` is the only representation of "done": a
// pasted line-through would otherwise strike a row permanently, with no way to clear it.
const STRIP_STYLE_PROPS =
  /(?:^|;)\s*(?:color|background-color|background|font-family|font-size|letter-spacing|text-decoration|text-decoration-line)\s*:[^;]*/gi;

/**
 * Drop the palette and type stack from inline styles, keeping the rest. Pasted markup drags
 * the source's along, and `insertHTML` stamps the caret's own computed values onto whatever
 * it inserts — both belong to the editor, not to the content.
 */
function stripAuthoredStyles(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const cleaned = (el.getAttribute('style') || '')
      .replace(STRIP_STYLE_PROPS, '')
      .replace(/^\s*;+\s*/, '')
      .trim();
    if (cleaned) el.setAttribute('style', cleaned);
    else el.removeAttribute('style');
  }
}

/**
 * The original checklist embedded a live `<input type="checkbox">`, whose ticked state
 * never survived `innerHTML` serialization. Stored descriptions still carry that markup,
 * so fold it into the attribute-based format on the way in — the old code recorded "done"
 * as a line-through on the row, which is the only signal that did persist.
 */
function upgradeLegacyChecklists(html: string): string {
  if (!/<input/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Grouped by host: with two boxes in one row, clearing `style` on the first pass destroyed
  // the line-through evidence and the second pass recomputed a completed item as unchecked.
  const hosts = new Map<Element, boolean>();
  for (const box of Array.from(doc.querySelectorAll('input[type="checkbox"]'))) {
    const row = box.parentElement;
    const done = box.hasAttribute('checked') || /line-through/i.test(row?.getAttribute('style') || '');
    box.remove();
    if (!row || row === doc.body) continue;
    hosts.set(row, (hosts.get(row) ?? false) || done);
  }
  for (const [row, done] of hosts) {
    row.removeAttribute('style');
    row.setAttribute(CHECKLIST_ATTR, '');
    row.setAttribute(CHECKED_ATTR, done ? 'true' : 'false');
  }
  return doc.body.innerHTML;
}

/**
 * Rows are flat by construction, but descriptions saved by an earlier build can hold rows nested
 * inside rows — drawing one box per level and stacking an indent per level. Lift each nested row
 * out to a sibling; removing it from between its neighbours also rejoins the text it had split.
 */
function flattenChecklists(body: HTMLElement): void {
  const nestedSelector = `[${CHECKLIST_ATTR}] [${CHECKLIST_ATTR}]`;
  // Each lift removes one level, so this converges; the bound is only a runaway guard.
  for (let guard = 0; guard < 500; guard++) {
    const nested = body.querySelector<HTMLElement>(nestedSelector);
    if (!nested) return;
    const outer = nested.parentElement?.closest<HTMLElement>(`[${CHECKLIST_ATTR}]`);
    if (!outer) return;
    outer.after(nested);
    outer.normalize();
  }
}

/**
 * Used on paste *and* on load: stored HTML is only as trustworthy as whatever wrote it,
 * and `innerHTML` assignment still fires inline handlers like `<img onerror>`.
 * `data-*` attributes survive DOMPurify by default, which is what carries checklist state.
 */
function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(upgradeLegacyChecklists(html), { ALLOWED_TAGS, ALLOWED_ATTR });
  const doc = new DOMParser().parseFromString(clean, 'text/html');

  stripAuthoredStyles(doc.body);

  for (const anchor of Array.from(doc.body.querySelectorAll('a[href]'))) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  }

  flattenChecklists(doc.body);

  // Anything that is not exactly "true" reads as unchecked, so a hand-edited or
  // foreign value can never render as a half-state.
  for (const row of Array.from(doc.body.querySelectorAll<HTMLElement>(`[${CHECKLIST_ATTR}]`))) {
    row.setAttribute(CHECKED_ATTR, row.getAttribute(CHECKED_ATTR) === 'true' ? 'true' : 'false');
  }

  return doc.body.innerHTML;
}

/** Sanitize stored rich text for non-editable renderers. */
export function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html);
}

/** Formatting under the caret, mirrored onto the toolbar so toggles read as on/off. */
interface ToolbarState {
  bold: boolean;
  italic: boolean;
  strikeThrough: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  checklist: boolean;
  block: string;
  link: boolean;
}

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  strikeThrough: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  checklist: false,
  block: '',
  link: false,
};

// execCommand queries throw in some engines (and are absent under jsdom) — never let
// a toolbar repaint break typing.
function queryCommandStateSafe(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function queryBlockTag(): string {
  try {
    return (document.queryCommandValue('formatBlock') || '').toLowerCase();
  } catch {
    return '';
  }
}

function sameToolbarState(a: ToolbarState, b: ToolbarState): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strikeThrough === b.strikeThrough &&
    a.insertUnorderedList === b.insertUnorderedList &&
    a.insertOrderedList === b.insertOrderedList &&
    a.checklist === b.checklist &&
    a.block === b.block &&
    a.link === b.link
  );
}

/**
 * "@" plus the name typed after it, at the very end of the text before the caret. The leading
 * boundary keeps an email address from opening the picker mid-word, and excluding "@" from the
 * query stops a second "@" from extending the first one's search.
 */
const MENTION_TRIGGER = /(?:^|[\s\u00a0([{])@([^\s\u00a0@]*)$/;

/** The mention a node ends with, descending through trailing wrappers. */
function chipEndingAt(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const element = current as HTMLElement;
    if (element.hasAttribute(DESCRIPTION_MENTION_ATTR)) return element;
    current = element.lastChild;
  }
  return null;
}

/** The span of text the picker will replace: "@query" inside one text node. */
interface MentionAnchor {
  node: Node;
  start: number;
  end: number;
}

interface MentionState {
  query: string;
  /** Viewport rect of the "@…" being typed, captured once so the list holds still. */
  rect: { left: number; top: number; height: number };
}

const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const MOD = IS_APPLE ? '⌘' : 'Ctrl+';
const SHIFT = IS_APPLE ? '⇧' : 'Shift+';

const ToolbarButton: React.FC<{
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}> = ({ onClick, title, children, active }) => (
  <button
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md ${active ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
    title={title}
    aria-label={title}
    aria-pressed={active}
    type="button"
  >
    {children}
  </button>
);

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start typing...',
  minHeight = '120px',
  mentionMembers,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR_STATE);
  // The picker is anchored to the "@" itself rather than to the editor box: in a description
  // several paragraphs long, a dropdown pinned to the frame can land nowhere near the caret.
  const [mention, setMention] = useState<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionAnchorRef = useRef<MentionAnchor | null>(null);
  const mentionProxyRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const mentionsEnabled = !!mentionMembers?.length;

  useEffect(() => {
    if (!editorRef.current || isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const safe = value ? sanitizeHtml(value) : '';
    if (editorRef.current.innerHTML !== safe) {
      editorRef.current.innerHTML = safe;
    }
  }, [value]);

  const readToolbarState = useCallback(() => {
    const el = editorRef.current;
    const anchor = window.getSelection()?.anchorNode;
    // Caret outside this editor — drop every highlight rather than showing stale marks.
    if (!el || !anchor || !el.contains(anchor)) {
      setToolbarState((prev) => (prev === EMPTY_TOOLBAR_STATE ? prev : EMPTY_TOOLBAR_STATE));
      return;
    }
    const anchorEl = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    const next: ToolbarState = {
      bold: queryCommandStateSafe('bold'),
      italic: queryCommandStateSafe('italic'),
      strikeThrough: queryCommandStateSafe('strikeThrough'),
      insertUnorderedList: queryCommandStateSafe('insertUnorderedList'),
      insertOrderedList: queryCommandStateSafe('insertOrderedList'),
      checklist: !!anchorEl?.closest(`[${CHECKLIST_ATTR}]`),
      block: queryBlockTag(),
      link: !!anchorEl?.closest('a'),
    };
    setToolbarState((prev) => (sameToolbarState(prev, next) ? prev : next));
  }, []);

  // `selectionchange` only fires on document, and it covers caret moves by keyboard,
  // mouse and programmatic commands alike.
  useEffect(() => {
    document.addEventListener('selectionchange', readToolbarState);
    return () => document.removeEventListener('selectionchange', readToolbarState);
  }, [readToolbarState]);

  const exec = useCallback(
    (command: string, val?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, val);
      // Collapsed-caret mark toggles don't move the selection, so no selectionchange fires.
      readToolbarState();
    },
    [readToolbarState],
  );

  /** The link under the caret, if the caret is inside this editor. */
  const currentAnchor = useCallback((): HTMLAnchorElement | null => {
    const el = editorRef.current;
    const node = window.getSelection()?.anchorNode;
    if (!el || !node || !el.contains(node)) return null;
    const from = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return from?.closest('a') ?? null;
  }, []);

  const selectNode = (node: Node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  /** Re-clicking the active heading returns the block to a paragraph. */
  const toggleBlock = useCallback(
    (tag: 'h2' | 'h3') => exec('formatBlock', toolbarState.block === tag ? 'p' : tag),
    [exec, toolbarState.block],
  );

  const handleInput = () => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  };

  // --- @mentions ---

  const closeMention = useCallback(() => {
    mentionAnchorRef.current = null;
    setMention(null);
    setMentionIndex(0);
  }, []);

  /** The "@query" immediately before a collapsed caret inside this editor, if there is one. */
  const readMentionTrigger = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel?.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
    const match = MENTION_TRIGGER.exec((node.textContent ?? '').slice(0, range.startOffset));
    if (!match) return null;
    const start = range.startOffset - match[1].length - 1;
    // Measure the "@…" rather than the collapsed caret: a caret range reports a zero rect in
    // some engines, and the "@" is the anchor that stays put while the name is typed.
    const probe = document.createRange();
    probe.setStart(node, start);
    probe.setEnd(node, range.startOffset);
    const box = probe.getBoundingClientRect();
    return {
      anchor: { node, start, end: range.startOffset },
      query: match[1].toLowerCase(),
      rect: { left: box.left, top: box.top, height: box.height },
    };
  }, []);

  /**
   * `allowOpen` is false for caret moves: clicking behind an "@" already in the text should
   * leave the picker shut, the way it does in the comment box.
   */
  const refreshMention = useCallback(
    (allowOpen: boolean) => {
      if (!mentionsEnabled) return;
      const trigger = readMentionTrigger();
      if (!trigger) {
        mentionAnchorRef.current = null;
        setMention(null);
        return;
      }
      mentionAnchorRef.current = trigger.anchor;
      setMention((prev) => (prev || allowOpen ? { query: trigger.query, rect: prev?.rect ?? trigger.rect } : null));
      setMentionIndex(0);
    },
    [mentionsEnabled, readMentionTrigger],
  );

  const mentionMatches = useMemo(() => {
    if (!mention || !mentionMembers) return [];
    return mentionMembers.filter((m) => m.name.toLowerCase().includes(mention.query)).slice(0, 6);
  }, [mention, mentionMembers]);

  const insertMention = (member: MentionCandidate) => {
    const el = editorRef.current;
    const target = mentionAnchorRef.current;
    if (!el || !target || !el.contains(target.node)) {
      closeMention();
      return;
    }
    const range = document.createRange();
    range.setStart(target.node, target.start);
    range.setEnd(target.node, target.end);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    // Built as a node so the name and the ID are escaped for us, then handed to execCommand
    // so the insertion joins the browser's own undo stack like every other edit here.
    const chip = document.createElement('span');
    chip.setAttribute(DESCRIPTION_MENTION_ATTR, member.id);
    chip.textContent = getMentionToken(member);
    el.focus();
    // A plain trailing space collapses at the end of a block, leaving the caret with nowhere
    // to sit outside the chip — and the next keystroke then extends the mention itself.
    document.execCommand('insertHTML', false, `${chip.outerHTML}&nbsp;`);
    stripAuthoredStyles(el);
    closeMention();
    handleInput();
  };

  // Caret moves can only close the picker, never open it, so this can ride the same
  // document-level event the toolbar uses.
  useEffect(() => {
    if (!mentionsEnabled) return;
    const onSelectionChange = () => refreshMention(false);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [mentionsEnabled, refreshMention]);

  useEffect(() => {
    if (!mention) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!mentionListRef.current?.contains(e.target as Node)) closeMention();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [mention, closeMention]);

  // Keep the highlighted row in view when arrowing past the visible slice of the list.
  useLayoutEffect(() => {
    mentionListRef.current
      ?.querySelector(`[data-mention-index="${mentionIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [mentionIndex]);

  const mentionPosition = useViewportPortalPosition({
    isOpen: !!mention && mentionMatches.length > 0,
    triggerRef: mentionProxyRef,
    fixedWidth: 224,
    estimatedHeight: 220,
  });

  /**
   * The mention the caret is inside of, or the one it sits directly behind. A chip is ordinary
   * editable text, so without this Backspace would eat it a letter at a time and leave a
   * half-word still carrying the profile ID.
   */
  const mentionChipAtCaret = (): HTMLElement | null => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel?.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return null;

    const from =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    const inside = from?.closest<HTMLElement>(`[${DESCRIPTION_MENTION_ATTR}]`);
    if (inside && el.contains(inside)) return inside;

    // Whatever sits immediately before the caret. `insertHTML` leaves the trailing space in a
    // wrapper of its own, so the chip is often an uncle rather than a previous sibling —
    // climb out of every element the caret starts in before looking left.
    let node: Node | null = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      if (range.startOffset > 0) return null; // there is text to delete first
    } else if (range.startOffset > 0) {
      return chipEndingAt(node.childNodes[range.startOffset - 1]);
    }
    while (node && node !== el) {
      if (node.previousSibling) return chipEndingAt(node.previousSibling);
      node = node.parentNode;
    }
    return null;
  };

  /** True when the key was consumed by the open picker. */
  const handleMentionKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!mention) return false;
    if (e.key === 'Escape') {
      closeMention();
      return true;
    }
    if (mentionMatches.length === 0) return false;
    if (e.key === 'ArrowDown') {
      setMentionIndex((i) => (i + 1) % mentionMatches.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      insertMention(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)]);
      return true;
    }
    return false;
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const rawHtml = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    const sanitized = rawHtml ? sanitizeHtml(rawHtml) : '';
    const hasTextContent =
      sanitized.length > 0 && !!new DOMParser().parseFromString(sanitized, 'text/html').body.textContent?.trim();

    if (hasTextContent) {
      document.execCommand('insertHTML', false, sanitized);
      return;
    }
    if (!text) return;

    const row = currentChecklistRow();
    const lines = text.split(/\r?\n/);
    if (row && lines.length > 1) {
      // insertText turns a newline into a <br>, leaving one checkbox for two visual lines —
      // and a strike across both when the row is done. Give each line its own row instead,
      // which is also how most people build a checklist: paste a list, get a list.
      document.execCommand('insertText', false, lines[0]);
      let previous = currentChecklistRow() ?? row;
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const next = document.createElement('div');
        setChecklistRow(next, true);
        next.appendChild(document.createTextNode(line));
        previous.after(next);
        previous = next;
      }
      const caret = document.createRange();
      caret.selectNodeContents(previous);
      caret.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(caret);
      handleInput();
      return;
    }
    document.execCommand('insertText', false, text);
  };

  const handleLink = () => {
    const anchor = currentAnchor();
    // Prefill the existing href so the prompt edits rather than replaces, and let an
    // emptied field remove the link — same contract as the docs editor.
    const url = prompt('URL (leave empty to remove the link):', anchor?.getAttribute('href') ?? 'https://');
    if (url === null) return;
    if (!url.trim()) {
      // unlink only covers a selection, so re-select the whole anchor first.
      if (anchor) selectNode(anchor);
      exec('unlink');
      return;
    }
    exec('createLink', url.trim());
    // createLink leaves target/rel off, which would open links in this tab while
    // pasted ones open in a new one.
    for (const created of Array.from(editorRef.current?.querySelectorAll('a[href]') ?? [])) {
      created.setAttribute('target', '_blank');
      created.setAttribute('rel', 'noopener noreferrer');
    }
    handleInput();
  };

  /** True when the collapsed caret sits before any content in the row. */
  const atRowStart = (row: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel?.isCollapsed || !sel.rangeCount) return false;
    const caret = sel.getRangeAt(0);
    const probe = document.createRange();
    probe.setStart(row, 0);
    probe.setEnd(caret.startContainer, caret.startOffset);
    return probe.toString() === '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Before everything else: while the picker is open it owns Enter, Tab and the arrows.
    if (handleMentionKeyDown(e)) {
      e.preventDefault();
      return;
    }
    // Bold/italic/underline get shortcuts from the browser; strikethrough does not.
    // Match the physical key: e.key is 'х' on a Cyrillic layout, which never equals 'x'.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === 'KeyX' || e.key.toLowerCase() === 'x')) {
      e.preventDefault();
      // On a row, "done" is owned by data-checked; a real <s> here would be invisible.
      if (!currentChecklistRow()) exec('strikeThrough');
      return;
    }
    // Shift+Enter too: a second visual line inside one row would share its single checkbox.
    if (e.key === 'Enter' && handleChecklistEnter()) {
      e.preventDefault();
      return;
    }
    // Backspace at the very start of a row leaves the checklist, keeping the text — the
    // discoverable way out for anyone who does not think to press the toolbar button.
    if (e.key === 'Backspace') {
      const chip = mentionChipAtCaret();
      if (chip) {
        e.preventDefault();
        chip.remove();
        handleInput();
        return;
      }
      const row = currentChecklistRow();
      if (row && atRowStart(row)) {
        e.preventDefault();
        setChecklistRow(row, false);
        handleInput();
      }
    }
  };

  /** Direct children of the editor that the selection touches — the "lines" to convert. */
  const selectedBlocks = (): HTMLElement[] => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel?.rangeCount) return [];
    const range = sel.getRangeAt(0);
    return Array.from(el.children).filter((child): child is HTMLElement => range.intersectsNode(child));
  };

  const rowFromNode = (node: Node | null | undefined): HTMLElement | null => {
    const el = editorRef.current;
    if (!el || !node || !el.contains(node)) return null;
    const from = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return from?.closest<HTMLElement>(`[${CHECKLIST_ATTR}]`) ?? null;
  };

  const currentChecklistRow = (): HTMLElement | null => rowFromNode(window.getSelection()?.anchorNode);

  const currentListType = (): 'ul' | 'ol' | null => {
    const el = editorRef.current;
    const node = window.getSelection()?.anchorNode;
    if (!el || !node || !el.contains(node)) return null;
    const from = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const list = from?.closest('ul, ol');
    return list ? (list.tagName.toLowerCase() as 'ul' | 'ol') : null;
  };

  const setChecklistRow = (block: HTMLElement, on: boolean) => {
    if (on) {
      block.setAttribute(CHECKLIST_ATTR, '');
      if (!block.hasAttribute(CHECKED_ATTR)) block.setAttribute(CHECKED_ATTR, 'false');
    } else {
      block.removeAttribute(CHECKLIST_ATTR);
      block.removeAttribute(CHECKED_ATTR);
    }
  };

  /**
   * Converts whole lines. The first version inserted a row at the caret instead, which split
   * the line's text and nested a row inside a row — one box drawn per level and the indentation
   * running away with it.
   */
  const handleChecklist = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    // A line is a bullet, a number, or a checkbox — never two at once, so leave the list first.
    const list = currentListType();
    if (list) exec(list === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');

    // Bare inline content (or an empty field) has no block to convert — give it one.
    if (!el.children.length) {
      const row = document.createElement('div');
      while (el.firstChild) row.appendChild(el.firstChild);
      if (!row.textContent) row.appendChild(document.createTextNode('To-do item'));
      el.appendChild(row);
      setChecklistRow(row, true);
      selectNode(row);
      handleInput();
      return;
    }

    // Lists and headings are line types of their own. Stamping a row onto a <ul> would draw a
    // single box for the whole list, which a multi-block selection could otherwise reach.
    const blocks = selectedBlocks().filter((b) => !NON_ROW_HOSTS.test(b.tagName));
    if (!blocks.length) return;
    // Every touched line already a row → the button turns them back into plain lines.
    const turnOff = blocks.every((b) => b.hasAttribute(CHECKLIST_ATTR));
    for (const block of blocks) setChecklistRow(block, !turnOff);
    handleInput();
  };

  /** Pressing a list button on a checklist row drops the checkbox rather than stacking both. */
  const applyList = (command: 'insertUnorderedList' | 'insertOrderedList') => {
    for (const block of selectedBlocks()) setChecklistRow(block, false);
    exec(command);
    handleInput();
  };

  /**
   * Enter inside a row splits it into a fresh *unchecked* row, and an empty row leaves the
   * checklist. Left to the browser, the new block inherited data-checked, so pressing Enter
   * after a completed item produced a new item that was already ticked.
   */
  const handleChecklistEnter = (): boolean => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    // Derive the row from the range START, not from anchorNode: on a backwards selection
    // anchorNode is the drag origin, and splitting from there rebuilt the nested rows.
    if (!rowFromNode(sel.getRangeAt(0).startContainer)) return false;

    // A selection spanning rows has to go first. extractContents on a range whose ends sit in
    // different blocks clones both of them into the fragment — re-creating nested rows.
    if (!sel.isCollapsed) exec('delete');

    const live = window.getSelection();
    if (!live?.rangeCount) return false;
    const range = live.getRangeAt(0);
    const row = rowFromNode(range.startContainer);
    if (!row) return false;

    // The empty-row branch must come before any lastChild guard, or a childless row falls
    // through to the browser's container clone — the original nesting bug.
    if (!row.textContent?.trim()) {
      setChecklistRow(row, false);
      if (!row.firstChild) row.appendChild(document.createElement('br'));
      handleInput();
      return true;
    }
    if (!row.lastChild) return false;

    const tail = range.cloneRange();
    tail.setEndAfter(row.lastChild);
    const moved = tail.extractContents();

    // Belt and braces: the split is one of the few places allowed to create a row, so it must
    // never be the thing that produces a block inside a block.
    if (moved.querySelector(`[${CHECKLIST_ATTR}], div, p, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote`)) {
      row.appendChild(moved);
      return false;
    }

    const next = document.createElement('div');
    setChecklistRow(next, true);
    next.appendChild(moved);
    // extractContents can hand back an empty text node, so testing firstChild is not enough:
    // without a <br> the row collapses to its padding and the box overflows the line below.
    if (!next.textContent) next.appendChild(document.createElement('br'));
    row.after(next);

    // Splitting at offset 0 empties the source row — it must not stay ticked, and it needs a
    // line box of its own so the caret can come back to it.
    if (!row.textContent?.trim()) {
      row.setAttribute(CHECKED_ATTR, 'false');
      if (!row.firstChild) row.appendChild(document.createElement('br'));
    }

    const caret = document.createRange();
    caret.setStart(next, 0);
    caret.collapse(true);
    live.removeAllRanges();
    live.addRange(caret);
    handleInput();
    return true;
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement | null)?.closest<HTMLElement>(`[${CHECKLIST_ATTR}]`);
    if (!row || !editorRef.current?.contains(row)) return;
    // The box is a pseudo-element and gets no events of its own, so hit-test the gutter it
    // occupies, measured rather than hard-coded so it tracks the CSS. Clicks on the label
    // fall through and just place the caret.
    const rect = row.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    if (e.clientX > rect.left + gutter) return;
    // Only the first line box: a wrapped row's later lines have no checkbox beside them.
    const firstLine = row.getClientRects()[0];
    if (firstLine && (e.clientY < firstLine.top || e.clientY > firstLine.bottom)) return;
    row.setAttribute(CHECKED_ATTR, row.getAttribute(CHECKED_ATTR) === 'true' ? 'false' : 'true');
    handleInput();
  };

  // Clearing the field leaves scaffolding behind (<p><br></p>, <div><br></div>, …),
  // so test for real content instead of matching known-empty strings.
  // An empty checklist row still renders a visible box, so it counts as content.
  // `<input` covers legacy rows that have not been re-saved yet.
  const isEmpty =
    !value || (!value.replace(/<[^>]*>/g, '').trim() && !new RegExp(`${CHECKLIST_ATTR}|<input\\b`, 'i').test(value));

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800/50 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-lg">
        <ToolbarButton onClick={() => toggleBlock('h2')} active={toolbarState.block === 'h2'} title="Heading 2">
          <span className="text-xs font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => toggleBlock('h3')} active={toolbarState.block === 'h3'} title="Heading 3">
          <span className="text-xs font-bold">H3</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('bold')} active={toolbarState.bold} title={`Bold (${MOD}B)`}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} active={toolbarState.italic} title={`Italic (${MOD}I)`}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            // On a row, "done" is owned by data-checked; a real <s> here would be invisible.
            if (!currentChecklistRow()) exec('strikeThrough');
          }}
          active={toolbarState.strikeThrough}
          title={`Strikethrough (${MOD}${SHIFT}X)`}
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => applyList('insertUnorderedList')}
          active={toolbarState.insertUnorderedList}
          title="Bullet List"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => applyList('insertOrderedList')}
          active={toolbarState.insertOrderedList}
          title="Numbered List"
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={handleChecklist} active={toolbarState.checklist} title="To-do List">
          <CheckSquare size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={handleLink} active={toolbarState.link} title="Link">
          <LinkIcon size={14} />
        </ToolbarButton>
      </div>
      {/* No blanket `[&_*]:!text-inherit` on the editor below: it compiled to
          `.rte-content * { color: inherit !important }`, which silently beat the muted colour of a
          completed row. sanitizeHtml already strips colour/font declarations from pasted markup. */}
      <div className="relative">
        {isEmpty && (
          <div className="absolute top-3 left-3 text-zinc-400 text-sm pointer-events-none">{placeholder}</div>
        )}
        <div
          ref={editorRef}
          contentEditable
          onInput={() => {
            handleInput();
            refreshMention(true);
          }}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onMouseUp={readToolbarState}
          onFocus={readToolbarState}
          onClick={handleEditorClick}
          className="rte-content w-full p-3 bg-transparent outline-none text-sm text-zinc-900 dark:text-white resize-y [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1 [&_a]:text-blue-500 [&_a]:underline [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
          style={{ minHeight }}
        />
        {/* A zero-width stand-in for the caret: the portal positioning hook measures a real
            element, and the "@" has none of its own until the mention is inserted. */}
        {mention && (
          <div
            aria-hidden
            ref={mentionProxyRef}
            className="pointer-events-none fixed"
            style={{ left: mention.rect.left, top: mention.rect.top, width: 1, height: mention.rect.height }}
          />
        )}
      </div>
      {mention &&
        mentionMatches.length > 0 &&
        mentionPosition &&
        createPortal(
          <div
            ref={mentionListRef}
            role="listbox"
            aria-label="Mention someone"
            // Keep the caret where it is: a mousedown that moved focus would drop the
            // selection this picker is about to replace.
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'fixed',
              top: mentionPosition.top,
              left: mentionPosition.left,
              width: mentionPosition.width,
              maxHeight: mentionPosition.maxHeight,
              transform: mentionPosition.flipUp ? 'translateY(-100%)' : undefined,
            }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[10000] overflow-y-auto py-1"
          >
            {mentionMatches.map((member, i) => (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={i === mentionIndex}
                data-mention-index={i}
                onMouseEnter={() => setMentionIndex(i)}
                onClick={() => insertMention(member)}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs ${
                  i === mentionIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                }`}
              >
                <Avatar src={member.avatar} alt={member.name} size="sm" />
                <span className="truncate text-zinc-900 dark:text-white">{member.name}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
};
