import React from 'react';
import type { CustomProperty, Member, Task, TaskComment, TaskTeamLink } from '../types';
import { formatDateEU } from './utils';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The exact token inserted by the mention picker. */
export function getMentionToken(member: Pick<Member, 'name'>): string {
  return `@${member.name.replace(/\s+/g, '')}`;
}

/**
 * Attribute carrying a mentioned profile ID inside description HTML. Comments store their
 * mentions in a junction table, but a description is a single HTML column — so the mention
 * travels inside the markup, where an edit to the text can never leave the ID behind.
 */
export const DESCRIPTION_MENTION_ATTR = 'data-mention';

/**
 * One look for a mention wherever React renders one. Description chips live inside stored
 * HTML instead of JSX and get the same pill from `.rte-content [data-mention]` in app.css —
 * keep the two in step.
 */
export const MENTION_PILL_CLASS =
  'rounded-full bg-blue-100 px-1.5 py-px font-medium text-blue-700 dark:bg-blue-500/25 dark:text-blue-200';

/**
 * What a description chip reads. Comments squash the spaces out because their mentions are
 * parsed back out of plain text; a description chip carries the ID in an attribute, so it is
 * free to show the name the way it is written.
 */
export function getDescriptionMentionLabel(member: Pick<Member, 'name'>): string {
  return `@${member.name}`;
}

/**
 * Re-stamp chip labels from the live member list. The attribute is the truth and the label is
 * decoration, so this is what makes a rename show through — and what quietly repairs chips
 * saved before the label read as a real name.
 */
export function withMentionLabels(html: string, members: Pick<Member, 'id' | 'name'>[]): string {
  if (!html || !members.length || !html.includes(DESCRIPTION_MENTION_ATTR)) return html;
  const byId = new Map(members.map((member) => [member.id, member]));
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  for (const el of Array.from(doc.body.querySelectorAll(`[${DESCRIPTION_MENTION_ATTR}]`))) {
    const member = byId.get(el.getAttribute(DESCRIPTION_MENTION_ATTR) ?? '');
    if (!member) continue; // a departed member keeps whatever the text last said
    const label = getDescriptionMentionLabel(member);
    if (el.textContent === label) continue;
    el.textContent = label;
    changed = true;
  }
  return changed ? doc.body.innerHTML : html;
}

/**
 * Profile IDs mentioned inside a rich-text description, deduplicated, in document order.
 * A chip whose label no longer reads as a mention has been typed over, so it is dropped —
 * the same rule comments apply when a token is edited away.
 */
export function parseDescriptionMentionIds(html: string | null | undefined): string[] {
  if (!html || !html.includes(DESCRIPTION_MENTION_ATTR)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ids = new Set<string>();
  for (const el of Array.from(doc.body.querySelectorAll(`[${DESCRIPTION_MENTION_ATTR}]`))) {
    const id = el.getAttribute(DESCRIPTION_MENTION_ATTR);
    if (id && el.textContent?.trim().startsWith('@')) ids.add(id);
  }
  return [...ids];
}

/**
 * Mentions the new description carries that the old one did not. Editing an unrelated
 * paragraph must not page everyone named in the description all over again.
 */
export function newDescriptionMentionIds(
  oldHtml: string | null | undefined,
  newHtml: string | null | undefined,
): string[] {
  const before = new Set(parseDescriptionMentionIds(oldHtml));
  return parseDescriptionMentionIds(newHtml).filter((id) => !before.has(id));
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
          <span key={i} className={MENTION_PILL_CLASS}>
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
