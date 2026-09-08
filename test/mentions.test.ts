import { describe, expect, it } from 'vitest';
import type { Member, Task, TaskComment, TaskTeamLink } from '../types';
import {
  collectTaskParticipantIds,
  filterSelectedMentionIds,
  newDescriptionMentionIds,
  parseDescriptionMentionIds,
  resolveCommentMentionIds,
  withMentionLabels,
} from '../lib/mentions';

const member = (id: string, name: string): Member => ({
  id,
  name,
  role: 'user',
  accessScope: 'full',
  jobTitle: '',
  avatar: '',
  teamId: 'home-team',
  teamIds: ['home-team'],
  status: 'active',
});

const members = [member('anna', 'Anna'), member('ann', 'Ann'), member('mary', 'Mary Jane')];

describe('structured comment mentions', () => {
  it('keeps only picker selections whose exact token remains in the submitted text', () => {
    expect(filterSelectedMentionIds('Hi @Anna and @MaryJane.', ['anna', 'ann', 'mary'], members)).toEqual([
      'anna',
      'mary',
    ]);
    expect(filterSelectedMentionIds('Hi @Anna', ['ann'], members)).toEqual([]);
    expect(filterSelectedMentionIds('Hi @Ann', ['anna'], members)).toEqual([]);
  });

  it('does not turn a raw typed @token into a grant', () => {
    expect(resolveCommentMentionIds('Hi @Anna', [], members)).toEqual([]);
  });

  it('drops a stale selected ID after its token is deleted', () => {
    expect(resolveCommentMentionIds('Mention removed', ['anna'], members)).toEqual([]);
  });
});

describe('description mentions', () => {
  it('reads the profile IDs out of the stored markup, once each', () => {
    const html = '<p>Ping <span data-mention="anna">@Anna</span> and <span data-mention="mary">@MaryJane</span>.</p>';
    expect(parseDescriptionMentionIds(html)).toEqual(['anna', 'mary']);
    expect(parseDescriptionMentionIds(`${html}<p><span data-mention="anna">@Anna</span></p>`)).toEqual([
      'anna',
      'mary',
    ]);
  });

  it('ignores a chip that has been typed over', () => {
    expect(parseDescriptionMentionIds('<p><span data-mention="anna">who?</span></p>')).toEqual([]);
    expect(parseDescriptionMentionIds('<p><span data-mention="anna"></span></p>')).toEqual([]);
  });

  it('returns nothing for plain descriptions', () => {
    expect(parseDescriptionMentionIds('<p>No mentions here, not even @Anna.</p>')).toEqual([]);
    expect(parseDescriptionMentionIds('')).toEqual([]);
    expect(parseDescriptionMentionIds(undefined)).toEqual([]);
  });

  it('reports only mentions the previous description did not already carry', () => {
    const before = '<p><span data-mention="anna">@Anna</span></p>';
    const after = '<p><span data-mention="anna">@Anna</span> <span data-mention="mary">@MaryJane</span></p>';
    expect(newDescriptionMentionIds(before, after)).toEqual(['mary']);
    expect(newDescriptionMentionIds(before, before)).toEqual([]);
    expect(newDescriptionMentionIds(null, after)).toEqual(['anna', 'mary']);
  });

  it('does not re-announce a mention that was only moved within the text', () => {
    const before = '<p>Intro <span data-mention="anna">@Anna</span></p>';
    const after = '<p><span data-mention="anna">@Anna</span> please review the intro</p>';
    expect(newDescriptionMentionIds(before, after)).toEqual([]);
  });
});

describe('description mentions survive the sanitizer', () => {
  it('keeps the chip and its profile ID through a save/load round trip', async () => {
    const { sanitizeRichTextHtml } = await import('../components/RichTextEditor');
    const stored = '<p>Ping <span data-mention="u-anna">@Anna</span> please</p>';
    const loaded = sanitizeRichTextHtml(stored);
    expect(parseDescriptionMentionIds(loaded)).toEqual(['u-anna']);
  });

  it('drops the palette and type stack a paste dragged onto the chip', async () => {
    const { sanitizeRichTextHtml } = await import('../components/RichTextEditor');
    const stored =
      '<p><span data-mention="u-anna" style="letter-spacing: -0.025em; background-color: transparent;">@Anna</span></p>';
    expect(sanitizeRichTextHtml(stored)).not.toContain('letter-spacing');
  });
});

describe('description mention labels', () => {
  const people = [member('anna', 'Anna'), member('mary', 'Mary Jane')];

  it('re-stamps a chip from the live member list', () => {
    const stored = '<p><span data-mention="mary">@MaryJane</span></p>';
    expect(withMentionLabels(stored, people)).toContain('>@Mary Jane<');
  });

  it('repairs the label after a rename without touching the ID', () => {
    const stored = '<p><span data-mention="anna">@Anna</span></p>';
    const renamed = withMentionLabels(stored, [member('anna', 'Anna Kovalenko')]);
    expect(renamed).toContain('>@Anna Kovalenko<');
    expect(parseDescriptionMentionIds(renamed)).toEqual(['anna']);
  });

  it('leaves a departed member’s chip as it was written', () => {
    const stored = '<p><span data-mention="ghost">@Ghost</span></p>';
    expect(withMentionLabels(stored, people)).toBe(stored);
  });

  it('returns the same string when there is nothing to stamp', () => {
    const plain = '<p>No mentions here</p>';
    expect(withMentionLabels(plain, people)).toBe(plain);
    expect(withMentionLabels('<p><span data-mention="anna">@Anna</span></p>', [])).toBe(
      '<p><span data-mention="anna">@Anna</span></p>',
    );
  });
});

describe('task mention participants', () => {
  it('returns only people already granted in the requested task context', () => {
    const task: Task = {
      id: 'task-1',
      title: 'Task',
      description: '',
      teamId: 'home-team',
      statusId: 'status-1',
      assigneeIds: ['assignee'],
      priority: 'medium',
      dueDate: '',
      placements: [],
      contentInfo: { type: 'Article', editorIds: ['editor'], designerIds: ['designer'] },
      customFieldValues: { 'home-person': ['home-custom'] },
    };
    const links: TaskTeamLink[] = [
      {
        id: 'link-1',
        taskId: task.id,
        teamId: 'linked-team',
        statusId: 'linked-status',
        sortOrder: 0,
        customFieldValues: { 'linked-person': 'linked-custom' },
        createdAt: '2026-08-11T10:00:00.000Z',
      },
    ];
    const comments: TaskComment[] = [
      {
        id: 'comment-1',
        taskId: task.id,
        userId: 'comment-author',
        content: '@ExistingMention',
        createdAt: '2026-08-11T10:00:00.000Z',
        mentionedIds: ['existing-mention'],
        contextTeamId: 'linked-team',
      },
      {
        id: 'comment-2',
        taskId: task.id,
        userId: 'home-comment-author',
        content: '@HomeMention',
        createdAt: '2026-08-11T10:00:00.000Z',
        mentionedIds: ['home-mention'],
        contextTeamId: 'home-team',
      },
    ];

    const propertiesByTeam = {
      'home-team': [{ id: 'home-person', name: 'Reviewer', type: 'person' as const }],
      'linked-team': [{ id: 'linked-person', name: 'Producer', type: 'person' as const }],
    };
    const linkedResult = collectTaskParticipantIds(task, links, propertiesByTeam, 'linked-team', comments);
    const homeResult = collectTaskParticipantIds(task, links, propertiesByTeam, 'home-team', comments);

    expect(new Set(linkedResult)).toEqual(new Set(['linked-custom', 'existing-mention']));
    expect(new Set(homeResult)).toEqual(new Set(['assignee', 'editor', 'designer', 'home-custom', 'home-mention']));
  });
});
