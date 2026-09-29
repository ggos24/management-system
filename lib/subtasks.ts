import { DESCRIPTION_MENTION_ATTR } from './mentions';

/**
 * Subtasks are the checklist rows of a task description — there is no table of their own.
 * The description HTML is the single source of truth, so progress is always derived from it.
 */

/** Marks a checklist row. State lives in `data-checked` so it survives serialization. */
export const CHECKLIST_ATTR = 'data-checklist';
export const CHECKED_ATTR = 'data-checked';

/**
 * The original checklist embedded a live `<input type="checkbox">`, whose ticked state
 * never survived `innerHTML` serialization. Stored descriptions still carry that markup,
 * so fold it into the attribute-based format on the way in — the old code recorded "done"
 * as a line-through on the row, which is the only signal that did persist.
 */
export function upgradeLegacyChecklists(html: string): string {
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
export function flattenChecklists(body: HTMLElement): void {
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
 * Identifies a row by its text, minus mention chips. The editor shows chips with names filled
 * in by `withMentionLabels` while the stored HTML may carry them bare, so counting their text
 * would make the same row look different on either side.
 */
export function subtaskKey(row: Element): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if ((node as Element).hasAttribute(DESCRIPTION_MENTION_ATTR)) return;
    node.childNodes.forEach(walk);
  };
  row.childNodes.forEach(walk);
  return text.replace(/[\s ]+/g, ' ').trim();
}

export interface Subtask {
  /** Position among the description's checklist rows. */
  index: number;
  /** What the row reads as, mentions included. */
  text: string;
  key: string;
  done: boolean;
}

export interface SubtaskSummary {
  items: Subtask[];
  done: number;
  total: number;
}

function mayHaveChecklist(html: string | null | undefined): html is string {
  return !!html && (html.includes(CHECKLIST_ATTR) || /<input/i.test(html));
}

/** Parse into a body with legacy rows upgraded and nested rows lifted — the shape the editor shows. */
function parseBody(html: string): HTMLElement {
  const body = new DOMParser().parseFromString(upgradeLegacyChecklists(html), 'text/html').body;
  flattenChecklists(body);
  return body;
}

function checklistRows(body: HTMLElement): HTMLElement[] {
  return Array.from(body.querySelectorAll<HTMLElement>(`[${CHECKLIST_ATTR}]`));
}

// Every card re-renders on any task change, and DOMParser is not free — memoize by the HTML
// itself, which is also what makes the cache self-invalidating.
const SUMMARY_CACHE_LIMIT = 500;
const summaryCache = new Map<string, SubtaskSummary | null>();

/** The description's checklist rows, or null when it has none. */
export function parseSubtasks(html: string | null | undefined): SubtaskSummary | null {
  if (!mayHaveChecklist(html) || typeof DOMParser === 'undefined') return null;
  const cached = summaryCache.get(html);
  if (cached !== undefined) return cached;

  const items = checklistRows(parseBody(html)).map((row, index) => ({
    index,
    text: (row.textContent ?? '').replace(/[\s ]+/g, ' ').trim(),
    key: subtaskKey(row),
    done: row.getAttribute(CHECKED_ATTR) === 'true',
  }));
  const summary = items.length ? { items, done: items.filter((i) => i.done).length, total: items.length } : null;

  if (summaryCache.size >= SUMMARY_CACHE_LIMIT) summaryCache.clear();
  summaryCache.set(html, summary);
  return summary;
}

/**
 * Flip one row. It is found by position when the text there still matches, otherwise by the
 * first row with that text — so a row identified in a slightly different copy of the
 * description (a draft, a fresher realtime version) still lands on the right item.
 * Returns null when no such row exists.
 */
export function toggleSubtaskInHtml(html: string | null | undefined, index: number, key: string): string | null {
  if (!mayHaveChecklist(html)) return null;
  const body = parseBody(html);
  const rows = checklistRows(body);
  const row = rows[index] && subtaskKey(rows[index]) === key ? rows[index] : rows.find((r) => subtaskKey(r) === key);
  if (!row) return null;
  row.setAttribute(CHECKED_ATTR, row.getAttribute(CHECKED_ATTR) === 'true' ? 'false' : 'true');
  return body.innerHTML;
}

/**
 * The rows whose tick flipped between two versions of a description — but only when that is the
 * *whole* difference. Any other edit returns null, so callers can tell a tick from a rewrite.
 */
export function diffSubtaskChecks(
  oldHtml: string | null | undefined,
  newHtml: string | null | undefined,
): { text: string; done: boolean }[] | null {
  if ((oldHtml ?? '') === (newHtml ?? '')) return null;
  if (!mayHaveChecklist(oldHtml) || !mayHaveChecklist(newHtml) || typeof DOMParser === 'undefined') return null;

  const oldBody = parseBody(oldHtml);
  const newBody = parseBody(newHtml);
  const oldRows = checklistRows(oldBody);
  const newRows = checklistRows(newBody);
  if (oldRows.length !== newRows.length) return null;

  const changed = newRows
    .map((row, i) => ({ row, was: oldRows[i].getAttribute(CHECKED_ATTR) === 'true' }))
    .filter(({ row, was }) => (row.getAttribute(CHECKED_ATTR) === 'true') !== was)
    .map(({ row, was }) => ({ text: (row.textContent ?? '').replace(/[\s ]+/g, ' ').trim(), done: !was }));
  if (!changed.length) return null;

  // With the ticks taken out, the two must be the same document.
  for (const row of [...oldRows, ...newRows]) row.removeAttribute(CHECKED_ATTR);
  return oldBody.innerHTML === newBody.innerHTML ? changed : null;
}
