import React from 'react';
import { Bold, Italic, List, CheckSquare, Link as LinkIcon } from 'lucide-react';

interface FormattingToolbarProps {
  onAction: (action: string) => void;
}

export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({ onAction }) => (
  <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-md">
    <button
      onClick={() => onAction('h2')}
      className="px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 text-xs font-bold"
      title="Heading 2"
    >
      H2
    </button>
    <button
      onClick={() => onAction('h3')}
      className="px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 text-xs font-bold"
      title="Heading 3"
    >
      H3
    </button>
    <button
      onClick={() => onAction('bold')}
      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400"
      title="Bold"
    >
      <Bold size={14} />
    </button>
    <button
      onClick={() => onAction('italic')}
      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400"
      title="Italic"
    >
      <Italic size={14} />
    </button>
    <button
      onClick={() => onAction('list')}
      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400"
      title="Bullet List"
    >
      <List size={14} />
    </button>
    <button
      onClick={() => onAction('todo')}
      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 flex items-center gap-1"
      title="To-do List"
    >
      <CheckSquare size={14} />
    </button>
    <button
      onClick={() => onAction('link')}
      className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400"
      title="Link"
    >
      <LinkIcon size={14} />
    </button>
  </div>
);
