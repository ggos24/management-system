import React from 'react';
import type { CustomProperty, Member, Task, TaskComment, TaskTeamLink } from '../types';
import { formatDateEU } from './utils';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The exact token inserted by the mention picker. */
export function getMentionToken(member: Pick<Member, 'name'>): string {
  return `@${member.name.replace(/\s+/g, '')}`;
}

function containsMentionToken(text: string, member: Pick<Member, 'name'>): boolean {
  const token = escapeRegExp(getMentionToken(member));
  return new RegExp(`(^|[\\s([{])${token}(?=$|[\\s.,!?;:)\\]}])`, 'iu').test(text);
}

/** Parse @mentions from free text and return the matched member IDs (deduplicated). */
export function parseMentionedMemberIds(text: string, members: Member[]): string[] {
  return members.filter((member) => containsMentionToken(text, member)).map((member) => member.id);
}

/**
 * Keep only picker selections whose exact token is still present in the submitted text.
 * This prevents a deleted token (or a similarly-prefixed name) from leaving a stale grant.
 */
export function filterSelectedMentionIds(text: string, selectedIds: string[], members: Member[]): string[] {
  const selected = new Set(selectedIds);
  return members
    .filter((member) => selected.has(member.id) && containsMentionToken(text, member))
    .map((member) => member.id);
}

/** Resolve IDs stored with a comment exclusively from autocomplete selections. */
export function resolveCommentMentionIds(text: string, selectedIds: string[], members: Member[]): string[] {
  return filterSelectedMentionIds(text, selectedIds, members);
}

function addPersonValue(target: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value) target.add(value);
  if (Array.isArray(value)) {
    for (const id of value) if (typeof id === 'string' && id) target.add(id);
  }
}

function addCustomPeople(
  target: Set<string>,
  values: Record<string, unknown> | undefined,
  properties: CustomProperty[],
): void {
  if (!values) return;
  for (const property of properties) {
    if (property.type === 'person') addPersonValue(target, values[property.id]);
  }
}

/** Collect existing task participants who are safe mention suggestions for a related-only user. */
export function collectTaskParticipantIds(
  task: Pick<Task, 'id' | 'teamId' | 'assigneeIds' | 'contentInfo' | 'customFieldValues'>,
  links: TaskTeamLink[],
  propertiesByTeam: Record<string, CustomProperty[]>,
  contextTeamId: string,
  comments: TaskComment[] = [],
): string[] {
  const participantIds = new Set<string>();
  if (contextTeamId === task.teamId) {
    for (const id of task.assigneeIds || []) participantIds.add(id);
    for (const id of task.contentInfo?.editorIds || []) participantIds.add(id);
    for (const id of task.contentInfo?.designerIds || []) participantIds.add(id);
    addCustomPeople(participantIds, task.customFieldValues, propertiesByTeam[task.teamId] || []);
  } else {
    const contextLink = links.find((link) => link.taskId === task.id && link.teamId === contextTeamId);
    if (contextLink) {
      addCustomPeople(participantIds, contextLink.customFieldValues, propertiesByTeam[contextTeamId] || []);
    }
  }

  for (const comment of comments) {
    if (comment.contextTeamId !== contextTeamId) continue;
    for (const id of comment.mentionedIds || []) participantIds.add(id);
  }
  return [...participantIds];
}

/** Render comment text with highlighted @mentions and linkified URLs. */
export function renderCommentContent(text: string, members: Member[]): React.ReactNode {
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const name = part.slice(1).toLowerCase();
      const isMember = members.some((m) => m.name.toLowerCase().replace(/\s+/g, '') === name);
      if (isMember) {
        return (
          <span key={i} className="text-blue-600 dark:text-blue-400 font-medium">
            {part}
          </span>
        );
      }
    }
    // Linkify URLs within the text segment
    const urlParts = part.split(/(https?:\/\/[^\s<]+)/g);
    if (urlParts.length > 1) {
      return (
        <span key={i}>
          {urlParts.map((seg, j) =>
            /^https?:\/\//.test(seg) ? (
              <a
                key={j}
                href={seg}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {seg}
              </a>
            ) : (
              seg
            ),
          )}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Compact relative time ("just now", "5m ago", "2h ago", "3d ago", then EU date). */
export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return formatDateEU(d);
}
