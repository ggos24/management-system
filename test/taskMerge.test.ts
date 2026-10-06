import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { sanitizeRichTextHtml } from '../lib/richText';
import { mergeBlocks, mergeList, mergeTaskEdits, rebaseUntouched, splitBlocks } from '../lib/taskMerge';

const options = { normalizeDescription: sanitizeRichTextHtml };

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Interview',
  description: '<p>Intro</p>',
  teamId: 'team-1',
  statusId: 'status-1',
  assigneeIds: ['a'],
  priority: 'medium',
  dueDate: '2026-10-10',
  doneDate: null,
  placements: ['Site'],
  links: [],
  contentInfo: { type: 'Editorial', editorIds: [], designerIds: [], notes: '', files: [] },
  customFieldValues: {},
  sortOrder: 3,
  ...overrides,
});

describe('mergeTaskEdits', () => {
  it("keeps the other person's description when I only changed something else (the reported bug)", () => {
    const base = task();
    const theirs = task({ description: '<p>Intro</p><p>A long text user 1 wrote.</p><p>And more.</p>' });
    const mine = task({ title: 'Interview, final' });

    const { task: merged, descriptionConflict } = mergeTaskEdits(base, mine, theirs, options);

    expect(merged.description).toBe(theirs.description);
    expect(merged.title).toBe('Interview, final');
    expect(descriptionConflict).toBe(false);
  });

  it('keeps both when both added text at the end of the description', () => {
    const base = task();
    const theirs = task({ description: '<p>Intro</p><p>A long text user 1 wrote.</p>' });
    const mine = task({ description: '<p>Intro</p><p>A small note.</p>' });

    const { task: merged, descriptionConflict } = mergeTaskEdits(base, mine, theirs, options);

    expect(merged.description).toBe('<p>Intro</p><p>A long text user 1 wrote.</p><p>A small note.</p>');
    expect(descriptionConflict).toBe(false);
  });

  it('merges edits to different paragraphs', () => {
    const base = task({ description: '<p>One</p><p>Two</p><p>Three</p>' });
    const theirs = task({ description: '<p>One, edited</p><p>Two</p><p>Three</p>' });
    const mine = task({ description: '<p>One</p><p>Two</p><p>Three, edited</p>' });

    const { task: merged, descriptionConflict } = mergeTaskEdits(base, mine, theirs, options);

    expect(merged.description).toBe('<p>One, edited</p><p>Two</p><p>Three, edited</p>');
    expect(descriptionConflict).toBe(false);
  });

  it('keeps both versions, theirs first, when both changed the same paragraph', () => {
    const base = task({ description: '<p>One</p><p>Two</p>' });
    const theirs = task({ description: '<p>One</p><p>Two, as they wrote it</p>' });
    const mine = task({ description: '<p>One</p><p>Two, as I wrote it</p>' });

    const { task: merged, descriptionConflict } = mergeTaskEdits(base, mine, theirs, options);

    expect(merged.description).toBe('<p>One</p><p>Two, as they wrote it</p><p>Two, as I wrote it</p>');
    expect(descriptionConflict).toBe(true);
  });

  it('does not mistake markup the editor rewrites on load for an edit', () => {
    // Stored without the attributes the editor adds to every link.
    const stored = '<p>See <a href="https://example.com">this</a></p><p>Two</p>';
    const base = task({ description: stored });
    const theirs = task({ description: '<p>See <a href="https://example.com">this</a></p><p>Two, edited</p>' });
    // The editor emitted its normalised form plus a new paragraph.
    const mine = task({ description: `${sanitizeRichTextHtml(stored)}<p>Three</p>` });

    const { task: merged, descriptionConflict } = mergeTaskEdits(base, mine, theirs, options);

    expect(descriptionConflict).toBe(false);
    expect(merged.description).toContain('Two, edited');
    expect(merged.description).toContain('<p>Three</p>');
  });

  it('combines both sides when people are added and removed', () => {
    const base = task({ assigneeIds: ['a', 'b'] });
    const theirs = task({ assigneeIds: ['a', 'b', 'c'] });
    const mine = task({ assigneeIds: ['b', 'd'] });

    expect(mergeTaskEdits(base, mine, theirs, options).task.assigneeIds).toEqual(['b', 'c', 'd']);
  });

  it('merges custom fields key by key and editors as a list', () => {
    const base = task({
      customFieldValues: { tone: 'news' },
      contentInfo: { type: 'Editorial', editorIds: ['e1'] },
    });
    const theirs = task({
      customFieldValues: { tone: 'news', region: 'Kyiv' },
      contentInfo: { type: 'Editorial', editorIds: ['e1', 'e2'] },
    });
    const mine = task({
      customFieldValues: { tone: 'feature' },
      contentInfo: { type: 'Editorial', editorIds: ['e1', 'e3'] },
    });

    const merged = mergeTaskEdits(base, mine, theirs, options).task;

    expect(merged.customFieldValues).toEqual({ tone: 'feature', region: 'Kyiv' });
    expect(merged.contentInfo?.editorIds).toEqual(['e1', 'e2', 'e3']);
  });

  it('keeps mine for a plain field both changed, and says so', () => {
    const { task: merged, overridden } = mergeTaskEdits(
      task(),
      task({ priority: 'high' }),
      task({ priority: 'low' }),
      options,
    );

    expect(merged.priority).toBe('high');
    expect(overridden).toEqual(['priority']);
  });

  it("takes card order and bin state from the server, never from the editor's copy", () => {
    const merged = mergeTaskEdits(
      task({ sortOrder: 3 }),
      task({ sortOrder: 0, title: 'x' }),
      task({ sortOrder: 7 }),
      options,
    ).task;

    expect(merged.sortOrder).toBe(7);
  });

  it('treats a missing optional field in the draft as its default, not as an edit', () => {
    const base: Partial<Task> = { ...task(), links: undefined, customFieldValues: undefined };
    const theirs = task({ links: [{ title: 'Doc', url: 'https://d' }], customFieldValues: { a: 1 } });

    const merged = mergeTaskEdits(base, { ...base }, theirs, options).task;

    expect(merged.links).toEqual(theirs.links);
    expect(merged.customFieldValues).toEqual({ a: 1 });
  });
});

describe('block merge', () => {
  it('splits loose text and inline runs into their own blocks and joins back exactly', () => {
    const html = 'Hello <b>world</b><br><div>Line two</div><ul><li>a</li></ul>tail';
    const blocks = splitBlocks(html);

    expect(blocks).toEqual(['Hello <b>world</b>', '<br>', '<div>Line two</div>', '<ul><li>a</li></ul>', 'tail']);
    expect(blocks.join('')).toBe(html);
  });

  it('applies a deletion on one side and an insertion elsewhere on the other', () => {
    const { blocks, conflict } = mergeBlocks(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c', 'd']);

    expect(blocks).toEqual(['a', 'c', 'd']);
    expect(conflict).toBe(false);
  });

  it('flags a block one side deleted and the other changed', () => {
    const { blocks, conflict } = mergeBlocks(['a', 'b', 'c'], ['a', 'c'], ['a', 'b2', 'c']);

    expect(conflict).toBe(true);
    expect(blocks).toEqual(['a', 'b2', 'c']);
  });

  it('takes an identical change once', () => {
    expect(mergeBlocks(['a', 'b'], ['a', 'x'], ['a', 'x'])).toEqual({ blocks: ['a', 'x'], conflict: false });
  });

  it('applies an insertion right before a block the other side changed', () => {
    const { blocks, conflict } = mergeBlocks(['a', 'b'], ['a', 'b2'], ['a', 'new', 'b']);

    expect(blocks).toEqual(['a', 'new', 'b2']);
    expect(conflict).toBe(false);
  });

  it('keeps everything, flagged, when a description is too long to diff block by block', () => {
    const base = Array.from({ length: 1500 }, (_, i) => `b${i}`);
    const { blocks, conflict } = mergeBlocks(base, [...base, 'mine'], [...base, 'theirs']);

    expect(conflict).toBe(true);
    expect(blocks).toContain('mine');
    expect(blocks).toContain('theirs');
  });
});

describe('mergeList', () => {
  it('keeps theirs order and appends my additions', () => {
    expect(mergeList(['a', 'b'], ['b', 'a', 'z'], ['b', 'a', 'y'], String)).toEqual(['b', 'a', 'y', 'z']);
  });
});

describe('rebaseUntouched', () => {
  it('brings in a newer description I have not touched, in both draft and base', () => {
    const base = task();
    const draft = { ...task({ title: 'Changed by me' }), viewingTeamId: 'team-2' };
    const theirs = task({ description: '<p>Intro</p><p>New from user 1</p>' });

    const rebased = rebaseUntouched(base, draft, theirs, options);

    expect(rebased?.draft.description).toBe(theirs.description);
    expect(rebased?.base.description).toBe(theirs.description);
    expect(rebased?.draft.title).toBe('Changed by me');
    expect(rebased?.draft.viewingTeamId).toBe('team-2');
  });

  it('leaves a field I am editing alone', () => {
    const base = task();
    const draft = task({ description: '<p>Intro, typing…</p>' });
    const theirs = task({ description: '<p>Intro</p><p>New from user 1</p>' });

    expect(rebaseUntouched(base, draft, theirs, options)).toBeNull();
  });
});
