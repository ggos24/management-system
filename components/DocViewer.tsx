import React from 'react';
import DOMPurify from 'dompurify';
import { Pencil, Trash2, ChevronRight } from 'lucide-react';
import { Doc } from '../types';
import { Button } from './ui';
import { formatDateEU } from '../lib/utils';

interface DocViewerProps {
  doc: Doc;
  breadcrumbs: { id: string; title: string }[];
  onEdit: () => void;
  onDelete: () => void;
  onNavigate: (id: string) => void;
  isAdmin: boolean;
}

export const DocViewer: React.FC<DocViewerProps> = ({ doc, breadcrumbs, onEdit, onDelete, onNavigate, isAdmin }) => {
  const clean = DOMPurify.sanitize(doc.contentHtml, {
    ADD_TAGS: ['figure'],
    ADD_ATTR: ['style', 'data-width', 'data-align'],
  });

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-zinc-400 mb-4">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.id}>
              {i > 0 && <ChevronRight size={12} />}
              <button onClick={() => onNavigate(crumb.id)} className="hover:text-zinc-600 dark:hover:text-zinc-300">
                {crumb.title}
              </button>
            </React.Fragment>
          ))}
          <ChevronRight size={12} />
          <span className="text-zinc-600 dark:text-zinc-300">{doc.title}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{doc.title}</h1>
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
            <Button variant="danger" size="sm" onClick={onDelete}>
              <Trash2 size={14} className="mr-1" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Description */}
      {doc.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{doc.description}</p>}

      {/* Meta */}
      <div className="text-xs text-zinc-400 mb-6">Last updated {formatDateEU(doc.updatedAt)}</div>

      {/* Content — uses shared .docs-prose from app.css */}
      <div
        className="docs-prose text-sm leading-relaxed text-zinc-800 dark:text-zinc-200"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </div>
  );
};
