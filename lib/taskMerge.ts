import type { ContentInfo, Task } from '../types';

/**
 * Three-way merge of task edits, so that two people editing the same task never
 * silently overwrite each other.
 *
 * - `base`   — the task as this editor last saw it from the server (the modal's
 *              snapshot at open, or the store copy an inline edit started from)
 * - `mine`   — that copy with this editor's changes
 * - `theirs` — the task as the server has it now, read fresh just before saving
 *
 * Each field takes whichever side changed it. A field both sides changed keeps
 * mine (the person saving now chose it) — except lists, which combine both sides'
 * additions and removals, custom fields, which merge key by key, and the
 * description, which merges block by block and keeps both versions of any block
 * both sides changed.
 */

export interface TaskMergeResult {
  task: Task;
  /**
   * Both sides changed the same part of the description. Both versions are kept
   * in `task.description` (theirs first), for the editor to review before saving.
   */
  descriptionConflict: boolean;
  /** Plain fields both sides changed to different values; mine was kept. */
  overridden: string[];
}

export interface TaskMergeOptions {
  /**
   * Brings description HTML from any source into one canonical form before it is
   * compared, so markup the editor rewrites on load (link attributes, checklist
   * flags, mention labels) is not mistaken for an edit.
   */
  normalizeDescription: (html: string) => string;
}

type Side = Partial<Task> | Task;

const EMPTY_CONTENT_INFO: Required<ContentInfo> = { type: '', editorIds: [], designerIds: [], notes: '', files: [] };

/** JSON-stable deep equality: key order never matters, undefined equals absent. */
function same(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .filter((k) => v[k] !== undefined)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}

/** Take whichever side changed the value; when both did, keep mine and report it. */
function mergeValue<T>(base: T, mine: T, theirs: T, field: string, overridden: string[]): T {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  overridden.push(field);
  return mine;
}

/**
 * Apply mine's additions and removals (relative to base) onto theirs, keeping
 * theirs' order and appending mine's additions in mine's order.
 */
export function mergeList<T>(base: T[], mine: T[], theirs: T[], key: (item: T) => string = stableStringify): T[] {
  const baseKeys = new Set(base.map(key));
  const mineKeys = new Set(mine.map(key));
  const removed = new Set([...baseKeys].filter((k) => !mineKeys.has(k)));
  const result = theirs.filter((item) => !removed.has(key(item)));
  const resultKeys = new Set(result.map(key));
  for (const item of mine) {
    const k = key(item);
    if (!baseKeys.has(k) && !resultKeys.has(k)) {
      result.push(item);
      resultKeys.add(k);
    }
  }
  return result;
}

function mergeRecord(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
  field: string,
  overridden: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const value = mergeValue(base[key], mine[key], theirs[key], `${field}.${key}`, overridden);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Merge two edits of a custom-field map key by key; where both changed a key, mine wins. */
export function mergeFieldValues(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): Record<string, unknown> {
  return mergeRecord(base, mine, theirs, 'customFieldValues', []);
}

function contentInfoOf(task: Side): Required<ContentInfo> {
  return { ...EMPTY_CONTENT_INFO, ...task.contentInfo } as Required<ContentInfo>;
}

// --- Description: block-level three-way merge ------------------------------------

/**
 * Split description HTML into top-level blocks: each element is one block, and a
 * run of loose text and inline elements between blocks is one block. Joining the
 * blocks gives back exactly the input.
 */
export function splitBlocks(html: string): string[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const holder = doc.createElement('div');
  const blocks: string[] = [];
  let inline = '';
  const serialize = (node: Node) => {
    holder.replaceChildren(node.cloneNode(true));
    return holder.innerHTML;
  };
  for (const node of Array.from(doc.body.childNodes)) {
    const isBlock = node.nodeType === Node.ELEMENT_NODE && !INLINE_TAGS.has((node as Element).tagName);
    if (isBlock || (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR')) {
      if (inline) blocks.push(inline);
      inline = '';
      blocks.push(serialize(node));
    } else {
      inline += serialize(node);
    }
  }
  if (inline) blocks.push(inline);
  return blocks;
}

const INLINE_TAGS = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'CODE', 'SPAN']);

interface Hunk {
  /** Base range [start, end) replaced by... */
  start: number;
  end: number;
  /** ...this side's blocks. */
  blocks: string[];
}

// Above this many cells the quadratic diff is not worth it; the description is
// then treated as one block (merged only if one side left it untouched).
const MAX_DIFF_CELLS = 1_000_000;

/** The edits that turn `base` into `side`, from a longest common subsequence. */
function hunks(base: string[], side: string[]): Hunk[] {
  const n = base.length;
  const m = side.length;
  // lcs[i][j] = LCS length of base[i..] and side[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = base[i] === side[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const result: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: Hunk | null = null;
  const flush = () => {
    if (open) result.push(open);
    open = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && base[i] === side[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      open ??= { start: i, end: i, blocks: [] };
      open.blocks.push(side[j++]);
    } else {
      open ??= { start: i, end: i, blocks: [] };
      open.end = ++i;
    }
  }
  flush();
  return result;
}

function overlaps(a: Hunk, b: Hunk): boolean {
  // Two insertions at the same point have no natural order, so they conflict too.
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  return a.start < b.end && b.start < a.end;
}

/** This side's blocks for the base range [start, end), given its hunks inside it. */
function sideBlocks(base: string[], start: number, end: number, sideHunks: Hunk[]): string[] {
  const out: string[] = [];
  let pos = start;
  for (const hunk of sideHunks) {
    out.push(...base.slice(pos, hunk.start), ...hunk.blocks);
    pos = hunk.end;
  }
  out.push(...base.slice(pos, end));
  return out;
}

/**
 * Merge two edits of `base`. Blocks only one side changed are taken from that
 * side, and blocks both added at the same spot are all kept, theirs first. Where
 * both changed or removed the same existing blocks, theirs and then mine are both
 * kept and `conflict` is set, for a person to resolve.
 */
export function mergeBlocks(base: string[], mine: string[], theirs: string[]): { blocks: string[]; conflict: boolean } {
  if ((base.length + 1) * Math.max(mine.length + 1, theirs.length + 1) > MAX_DIFF_CELLS) {
    return { blocks: [...theirs, ...mine], conflict: true };
  }
  const tagged = [
    ...hunks(base, theirs).map((hunk) => ({ hunk, side: 'theirs' as const })),
    ...hunks(base, mine).map((hunk) => ({ hunk, side: 'mine' as const })),
  ].sort((a, b) => a.hunk.start - b.hunk.start || a.hunk.end - b.hunk.end);

  // Group hunks that touch the same base blocks.
  const groups: { start: number; end: number; members: typeof tagged }[] = [];
  for (const item of tagged) {
    const last = groups[groups.length - 1];
    if (last && (item.hunk.start < last.end || last.members.some((member) => overlaps(member.hunk, item.hunk)))) {
      last.members.push(item);
      last.end = Math.max(last.end, item.hunk.end);
    } else {
      groups.push({ start: item.hunk.start, end: item.hunk.end, members: [item] });
    }
  }

  const out: string[] = [];
  let conflict = false;
  let pos = 0;
  for (const group of groups) {
    out.push(...base.slice(pos, group.start));
    const ofSide = (side: 'mine' | 'theirs') => group.members.filter((m) => m.side === side).map((m) => m.hunk);
    const theirsBlocks = sideBlocks(base, group.start, group.end, ofSide('theirs'));
    const mineBlocks = sideBlocks(base, group.start, group.end, ofSide('mine'));
    if (!ofSide('mine').length) out.push(...theirsBlocks);
    else if (!ofSide('theirs').length || same(theirsBlocks, mineBlocks)) out.push(...mineBlocks);
    else if (group.members.every((member) => member.hunk.start === member.hunk.end)) {
      // Both only added blocks at the same spot — typically both wrote at the end.
      // Nothing was changed or removed, so keep both, theirs first, as a clean merge.
      out.push(...theirsBlocks, ...mineBlocks);
    } else {
      conflict = true;
      out.push(...theirsBlocks, ...mineBlocks);
    }
    pos = group.end;
  }
  out.push(...base.slice(pos));
  return { blocks: out, conflict };
}

function mergeDescription(
  base: string,
  mine: string,
  theirs: string,
  normalize: (html: string) => string,
): { html: string; conflict: boolean } {
  const [b, m, t] = [base, mine, theirs].map((html) => (html ? normalize(html) : ''));
  // Untouched by me: theirs as stored, byte for byte.
  if (m === b) return { html: theirs, conflict: false };
  if (t === b || m === t) return { html: mine, conflict: false };
  const { blocks, conflict } = mergeBlocks(splitBlocks(b), splitBlocks(m), splitBlocks(t));
  return { html: blocks.join(''), conflict };
}

// --- Whole task -----------------------------------------------------------------

export function mergeTaskEdits(base: Side, mine: Side, theirs: Task, options: TaskMergeOptions): TaskMergeResult {
  const overridden: string[] = [];
  const scalar = <K extends keyof Task>(field: K, fallback: Task[K]): Task[K] =>
    mergeValue<Task[K]>(
      (base[field] ?? fallback) as Task[K],
      (mine[field] ?? fallback) as Task[K],
      theirs[field] ?? fallback,
      field,
      overridden,
    );

  const description = mergeDescription(
    base.description ?? '',
    mine.description ?? '',
    theirs.description ?? '',
    options.normalizeDescription,
  );
  const [baseInfo, mineInfo, theirsInfo] = [base, mine, theirs].map(contentInfoOf);

  const task: Task = {
    ...theirs,
    title: scalar('title', ''),
    description: description.html,
    teamId: scalar('teamId', ''),
    statusId: scalar('statusId', null),
    priority: scalar('priority', 'medium'),
    dueDate: scalar('dueDate', ''),
    doneDate: scalar('doneDate', null),
    assigneeIds: mergeList(base.assigneeIds ?? [], mine.assigneeIds ?? [], theirs.assigneeIds ?? [], String),
    placements: mergeList(base.placements ?? [], mine.placements ?? [], theirs.placements ?? [], String),
    links: mergeList(base.links ?? [], mine.links ?? [], theirs.links ?? []),
    contentInfo: {
      type: mergeValue(baseInfo.type, mineInfo.type, theirsInfo.type, 'contentInfo.type', overridden),
      notes: mergeValue(baseInfo.notes, mineInfo.notes, theirsInfo.notes, 'contentInfo.notes', overridden),
      editorIds: mergeList(baseInfo.editorIds, mineInfo.editorIds, theirsInfo.editorIds, String),
      designerIds: mergeList(baseInfo.designerIds, mineInfo.designerIds, theirsInfo.designerIds, String),
      files: mergeList(baseInfo.files, mineInfo.files, theirsInfo.files),
    },
    customFieldValues: mergeRecord(
      base.customFieldValues ?? {},
      mine.customFieldValues ?? {},
      theirs.customFieldValues ?? {},
      'customFieldValues',
      overridden,
    ),
    // Never edited from a copy: card order, identity and bin state are the server's.
    id: theirs.id,
    sortOrder: theirs.sortOrder,
    createdAt: theirs.createdAt,
    deletedAt: theirs.deletedAt,
    deletedBy: theirs.deletedBy,
  };
  return { task, descriptionConflict: description.conflict, overridden };
}

/**
 * Bring the server's newer copy into an open draft without touching anything the
 * editor has changed: every field the draft still has at its base value moves to
 * theirs, in both the draft and the base. Returns null when nothing moved.
 */
export function rebaseUntouched<D extends Partial<Task>>(
  base: Partial<Task>,
  draft: D,
  theirs: Task,
  options: TaskMergeOptions,
): { base: Partial<Task>; draft: D } | null {
  const nextBase: Partial<Task> = { ...base };
  const nextDraft: D = { ...draft };
  let moved = false;
  for (const field of REBASED_FIELDS) {
    const untouched =
      field === 'description'
        ? (draft.description ?? '') === (base.description ?? '') ||
          options.normalizeDescription(draft.description ?? '') === options.normalizeDescription(base.description ?? '')
        : same(draft[field], base[field]);
    if (!untouched || same(theirs[field], base[field])) continue;
    (nextBase as Record<string, unknown>)[field] = theirs[field];
    (nextDraft as Record<string, unknown>)[field] = theirs[field];
    moved = true;
  }
  return moved ? { base: nextBase, draft: nextDraft } : null;
}

const REBASED_FIELDS = [
  'title',
  'description',
  'teamId',
  'statusId',
  'priority',
  'dueDate',
  'doneDate',
  'assigneeIds',
  'placements',
  'links',
  'contentInfo',
  'customFieldValues',
  'sortOrder',
] as const satisfies readonly (keyof Task)[];
