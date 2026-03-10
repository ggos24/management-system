import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { Doc } from '../types';
import { IconComponent } from './IconComponent';

interface DocsTreeSidebarProps {
  docs: Doc[];
  activeId: string | null;
  onSelect: (doc: Doc) => void;
  filter: string;
}

interface TreeNode {
  doc: Doc;
  children: TreeNode[];
}

function buildTree(docs: Doc[], filter: string): TreeNode[] {
  const lowerFilter = filter.toLowerCase();
  const filtered = filter ? docs.filter((d) => d.title.toLowerCase().includes(lowerFilter)) : docs;

  // When filtering, show flat list
  if (filter) {
    return filtered.map((d) => ({ doc: d, children: [] }));
  }

  // Build parent -> children map
  const childMap = new Map<string | null, Doc[]>();
  for (const doc of docs) {
    const key = doc.parentId;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(doc);
  }

  function buildNodes(parentId: string | null): TreeNode[] {
    const children = childMap.get(parentId) || [];
    return children.map((doc) => ({
      doc,
      children: doc.isFolder ? buildNodes(doc.id) : [],
    }));
  }

  return buildNodes(null);
}

const TreeItem: React.FC<{
  node: TreeNode;
  activeId: string | null;
  onSelect: (doc: Doc) => void;
  depth: number;
}> = ({ node, activeId, onSelect, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const isActive = node.doc.id === activeId;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (node.doc.isFolder && hasChildren) setExpanded(!expanded);
          onSelect(node.doc);
        }}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white font-medium'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {node.doc.isFolder ? (
          <>
            {hasChildren ? (
              expanded ? (
                <ChevronDown size={14} className="flex-shrink-0 text-zinc-400" />
              ) : (
                <ChevronRight size={14} className="flex-shrink-0 text-zinc-400" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            {node.doc.icon ? (
              <IconComponent name={node.doc.icon} size={14} className="flex-shrink-0 text-amber-500" />
            ) : expanded ? (
              <FolderOpen size={14} className="flex-shrink-0 text-amber-500" />
            ) : (
              <Folder size={14} className="flex-shrink-0 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileText size={14} className="flex-shrink-0 text-zinc-400" />
          </>
        )}
        <span className="truncate">{node.doc.title}</span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <TreeItem key={child.doc.id} node={child} activeId={activeId} onSelect={onSelect} depth={depth + 1} />
        ))}
    </div>
  );
};

export const DocsTreeSidebar: React.FC<DocsTreeSidebarProps> = ({ docs, activeId, onSelect, filter }) => {
  const tree = useMemo(() => buildTree(docs, filter), [docs, filter]);

  if (tree.length === 0) {
    return <div className="px-3 py-6 text-center text-xs text-zinc-400">No articles found</div>;
  }

  return (
    <nav className="space-y-0.5 py-1">
      {tree.map((node) => (
        <TreeItem key={node.doc.id} node={node} activeId={activeId} onSelect={onSelect} depth={0} />
      ))}
    </nav>
  );
};
