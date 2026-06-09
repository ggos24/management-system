import React from 'react';
import type { Member } from '../types';
import { formatDateEU } from './utils';

/** Parse @mentions from free text and return the matched member IDs (deduplicated). */
export function parseMentionedMemberIds(text: string, members: Member[]): string[] {
  const mentionRegex = /@(\S+)/g;
  const mentioned: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    const member = members.find((m) => m.name.toLowerCase().replace(/\s+/g, '') === name);
    if (member) mentioned.push(member.id);
  }
  return [...new Set(mentioned)];
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
