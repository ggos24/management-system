import DOMPurify from 'dompurify';
import { CHECKED_ATTR, CHECKLIST_ATTR, flattenChecklists, upgradeLegacyChecklists } from './subtasks';

// The one normaliser for stored description HTML. The editor runs it on load and
// on paste, read-only renderers run it before display, and the task merge runs it
// on every side before comparing, so all three agree on what "unchanged" means.

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

// text-decoration is included because `data-checked` is the only representation of "done": a
// pasted line-through would otherwise strike a row permanently, with no way to clear it.
const STRIP_STYLE_PROPS =
  /(?:^|;)\s*(?:color|background-color|background|font-family|font-size|letter-spacing|text-decoration|text-decoration-line)\s*:[^;]*/gi;

/**
 * Drop the palette and type stack from inline styles, keeping the rest. Pasted markup drags
 * the source's along, and `insertHTML` stamps the caret's own computed values onto whatever
 * it inserts on the paste path — both belong to the editor, not to the content.
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
 * Used on paste *and* on load: stored HTML is only as trustworthy as whatever wrote it,
 * and `innerHTML` assignment still fires inline handlers like `<img onerror>`.
 * `data-*` attributes survive DOMPurify by default, which is what carries checklist state.
 */
export function sanitizeRichTextHtml(html: string): string {
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
