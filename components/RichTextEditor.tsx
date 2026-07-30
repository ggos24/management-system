import React, { useRef, useEffect, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import { Bold, Italic, List, ListOrdered, CheckSquare, Link as LinkIcon, Strikethrough } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

/** Marks a checklist row. State lives in `data-checked` so it survives serialization. */
const CHECKLIST_ATTR = 'data-checklist';
const CHECKED_ATTR = 'data-checked';
/** Horizontal band, from the row's left edge, where the ::before box is drawn. */
const CHECKBOX_HIT_WIDTH = 22;

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

const STRIP_STYLE_PROPS = /(?:^|;)\s*(?:color|background-color|background|font-family|font-size)\s*:[^;]*/gi;

/**
 * The original checklist embedded a live `<input type="checkbox">`, whose ticked state
 * never survived `innerHTML` serialization. Stored descriptions still carry that markup,
 * so fold it into the attribute-based format on the way in — the old code recorded "done"
 * as a line-through on the row, which is the only signal that did persist.
 */
function upgradeLegacyChecklists(html: string): string {
  if (!/<input/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const box of Array.from(doc.querySelectorAll('input[type="checkbox"]'))) {
    const row = box.parentElement;
    const wasChecked = box.hasAttribute('checked');
    box.remove();
    if (!row || row === doc.body) continue;
    const done = wasChecked || /line-through/i.test(row.getAttribute('style') || '');
    row.removeAttribute('style');
    row.setAttribute(CHECKLIST_ATTR, '');
    row.setAttribute(CHECKED_ATTR, done ? 'true' : 'false');
  }
  return doc.body.innerHTML;
}

/**
 * Used on paste *and* on load: stored HTML is only as trustworthy as whatever wrote it,
 * and `innerHTML` assignment still fires inline handlers like `<img onerror>`.
 * `data-*` attributes survive DOMPurify by default, which is what carries checklist state.
 */
function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(upgradeLegacyChecklists(html), { ALLOWED_TAGS, ALLOWED_ATTR });
  const doc = new DOMParser().parseFromString(clean, 'text/html');

  // Pasted markup drags along the source's palette and type stack; the editor owns those.
  for (const el of Array.from(doc.body.querySelectorAll('[style]'))) {
    const cleaned = (el.getAttribute('style') || '')
      .replace(STRIP_STYLE_PROPS, '')
      .replace(/^\s*;+\s*/, '')
      .trim();
    if (cleaned) el.setAttribute('style', cleaned);
    else el.removeAttribute('style');
  }

  for (const anchor of Array.from(doc.body.querySelectorAll('a[href]'))) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  }

  return doc.body.innerHTML;
}

/** Formatting under the caret, mirrored onto the toolbar so toggles read as on/off. */
interface ToolbarState {
  bold: boolean;
  italic: boolean;
  strikeThrough: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  block: string;
  link: boolean;
}

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  strikeThrough: false,
  insertUnorderedList: false,
  insertOrderedList: false,
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
    a.block === b.block &&
    a.link === b.link
  );
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
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR_STATE);

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

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const rawHtml = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    const sanitized = rawHtml ? sanitizeHtml(rawHtml) : '';
    const hasTextContent =
      sanitized.length > 0 && !!new DOMParser().parseFromString(sanitized, 'text/html').body.textContent?.trim();

    if (hasTextContent) {
      document.execCommand('insertHTML', false, sanitized);
    } else if (text) {
      document.execCommand('insertText', false, text);
    }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Bold/italic/underline get shortcuts from the browser; strikethrough does not.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      exec('strikeThrough');
    }
  };

  const handleChecklist = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const selectedText = range.toString();

    const row = document.createElement('div');
    row.setAttribute(CHECKLIST_ATTR, '');
    row.setAttribute(CHECKED_ATTR, 'false');
    row.appendChild(document.createTextNode(selectedText || 'To-do item'));

    range.deleteContents();
    range.insertNode(row);

    // With no selection to convert we inserted placeholder text — highlight it so the
    // next keystroke replaces it. Otherwise leave the caret at the end of the row.
    const caret = document.createRange();
    if (selectedText) {
      caret.setStart(row, row.childNodes.length);
      caret.collapse(true);
    } else {
      caret.selectNodeContents(row);
    }
    sel.removeAllRanges();
    sel.addRange(caret);
    handleInput();
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement | null)?.closest<HTMLElement>(`[${CHECKLIST_ATTR}]`);
    if (!row || !editorRef.current?.contains(row)) return;
    // The box is a pseudo-element and gets no events of its own, so hit-test the band
    // it occupies. Clicks on the label fall through and just place the caret.
    if (e.clientX > row.getBoundingClientRect().left + CHECKBOX_HIT_WIDTH) return;
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
          onClick={() => exec('strikeThrough')}
          active={toolbarState.strikeThrough}
          title={`Strikethrough (${MOD}${SHIFT}X)`}
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec('insertUnorderedList')}
          active={toolbarState.insertUnorderedList}
          title="Bullet List"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec('insertOrderedList')}
          active={toolbarState.insertOrderedList}
          title="Numbered List"
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={handleChecklist} title="To-do List">
          <CheckSquare size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={handleLink} active={toolbarState.link} title="Link">
          <LinkIcon size={14} />
        </ToolbarButton>
      </div>
      <div className="relative">
        {isEmpty && (
          <div className="absolute top-3 left-3 text-zinc-400 text-sm pointer-events-none">{placeholder}</div>
        )}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onMouseUp={readToolbarState}
          onFocus={readToolbarState}
          onClick={handleEditorClick}
          className="rte-content w-full p-3 bg-transparent outline-none text-sm text-zinc-900 dark:text-white [&_*]:!text-inherit resize-y [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1 [&_a]:!text-blue-500 [&_a]:underline [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
};
