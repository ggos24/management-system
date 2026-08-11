import { describe, expect, it } from 'vitest';
import type { Member, Task, TaskComment, TaskTeamLink } from '../types';
import { collectTaskParticipantIds, filterSelectedMentionIds, resolveCommentMentionIds } from '../lib/mentions';

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
