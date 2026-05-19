import React, { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, List, CheckSquare, Link as LinkIcon } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'CODE',
  'PRE',
  'P',
  'BR',
  'DIV',
  'SPAN',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
]);

const STRIP_STYLE_PROPS = /(?:^|;)\s*(?:color|background-color|background|font-family|font-size)\s*:[^;]*/gi;

function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const walk = (node: Node) => {
    // Iterate children snapshot — we mutate the tree during traversal
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toUpperCase();

        if (
          tag === 'SCRIPT' ||
          tag === 'STYLE' ||
          tag === 'IFRAME' ||
          tag === 'OBJECT' ||
          tag === 'EMBED' ||
          tag === 'META' ||
          tag === 'LINK' ||
          tag === 'NOSCRIPT'
        ) {
          el.remove();
          continue;
        }

        if (!ALLOWED_TAGS.has(tag)) {
          // Unwrap: replace element with its children
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
          }
          // Re-walk parent's children (we already snapshotted, but unwrapped nodes
          // are now siblings — they'll be in the snapshot at their original positions
          // only if they were already child references; safer to re-walk parent)
          if (parent) walk(parent);
          continue;
        }

        // Strip dangerous + presentational attributes
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            continue;
          }
          if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (name === 'style') {
            const cleaned = value
              .replace(STRIP_STYLE_PROPS, '')
              .replace(/^\s*;+\s*/, '')
              .trim();
            if (cleaned) el.setAttribute('style', cleaned);
            else el.removeAttribute('style');
            continue;
          }
          // Keep href, target, rel on links; drop everything else
          if (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel')) continue;
          el.removeAttribute(attr.name);
        }

        // Ensure external links open safely
        if (tag === 'A' && el.getAttribute('href')) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }

        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  walk(doc.body);
  return doc.body.innerHTML;
}

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
    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-zinc-600 dark:text-zinc-400 ${active ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
    title={title}
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

  useEffect(() => {
    if (!editorRef.current || isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = useCallback((command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
  }, []);

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

    const sanitized = rawHtml ? sanitizePastedHtml(rawHtml) : '';
    const hasTextContent =
      sanitized.length > 0 && !!new DOMParser().parseFromString(sanitized, 'text/html').body.textContent?.trim();

    if (hasTextContent) {
      document.execCommand('insertHTML', false, sanitized);
    } else if (text) {
      document.execCommand('insertText', false, text);
    }
  };

  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  };

  const handleChecklist = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.marginRight = '6px';
    checkbox.style.verticalAlign = 'middle';
    checkbox.addEventListener('change', () => {
      const label = checkbox.nextSibling;
      if (label && label.nodeType === Node.TEXT_NODE) {
        const span = checkbox.parentElement;
        if (span) span.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
      }
      handleInput();
    });

    const wrapper = document.createElement('div');
    wrapper.style.padding = '2px 0';
    wrapper.appendChild(checkbox);

    const selectedText = range.toString();
    wrapper.appendChild(document.createTextNode(selectedText || 'To-do item'));

    range.deleteContents();
    range.insertNode(wrapper);

    const newRange = document.createRange();
    newRange.setStartAfter(wrapper);
    sel.removeAllRanges();
    sel.addRange(newRange);
    handleInput();
  };

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>';

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800/50 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-lg">
        <ToolbarButton onClick={() => exec('formatBlock', 'h2')} title="Heading 2">
          <span className="text-xs font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('formatBlock', 'h3')} title="Heading 3">
          <span className="text-xs font-bold">H3</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('bold')} title="Bold">
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} title="Italic">
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('insertUnorderedList')} title="Bullet List">
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={handleChecklist} title="To-do List">
          <CheckSquare size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={handleLink} title="Link">
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
          className="w-full p-3 bg-transparent outline-none text-sm text-zinc-900 dark:text-white [&_*]:!text-inherit resize-y [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1 [&_a]:!text-blue-500 [&_a]:underline [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
};
