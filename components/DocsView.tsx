import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Search, Plus, FolderPlus, FileText, Folder, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { IconComponent } from './IconComponent';
import { Doc, DocSection } from '../types';
import { fetchDocs, upsertDoc, deleteDoc as deleteDocDb } from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import { isAdminOrAbove } from '../constants';
import { DocsTreeSidebar } from './DocsTreeSidebar';
import { DocViewer } from './DocViewer';
import { DocEditor } from './DocEditor';
import { Button, Input } from './ui';
import { Modal } from './Modal';

interface DocsViewProps {
  section: DocSection;
  docId?: string;
  onNavigate: (docId?: string) => void;
}

type Mode = 'view' | 'edit' | 'create-doc' | 'create-folder';

export const DocsView: React.FC<DocsViewProps> = ({ section, docId, onNavigate }) => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser ? isAdminOrAbove(currentUser.role) : false;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');
  const [treeFilter, setTreeFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Doc | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchDocs(section);
      setDocs(data);
    } catch {
      toast.error('Failed to load articles');
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const activeDoc = useMemo(() => (docId ? docs.find((d) => d.id === docId) : null), [docId, docs]);

  const folders = useMemo(() => docs.filter((d) => d.isFolder), [docs]);

  // For index view: folders and standalone articles at current level
  const currentParentId = activeDoc?.isFolder ? activeDoc.id : null;
  const indexFolders = useMemo(
    () => docs.filter((d) => d.isFolder && d.parentId === currentParentId),
    [docs, currentParentId],
  );
  const indexArticles = useMemo(
    () => docs.filter((d) => !d.isFolder && d.parentId === currentParentId),
    [docs, currentParentId],
  );
  const childCount = useCallback(
    (folderId: string) => docs.filter((d) => !d.isFolder && d.parentId === folderId).length,
    [docs],
  );

  const breadcrumbs = useMemo(() => {
    if (!activeDoc) return [];
    const crumbs: { id: string; title: string }[] = [];
    let current = activeDoc.parentId;
    while (current) {
      const parent = docs.find((d) => d.id === current);
      if (parent) {
        crumbs.unshift({ id: parent.id, title: parent.title });
        current = parent.parentId;
      } else {
        break;
      }
    }
    return crumbs;
  }, [activeDoc, docs]);

  const handleSave = async (data: {
    id?: string;
    title: string;
    slug: string;
    description: string | null;
    parentId: string | null;
    icon: string | null;
    content: Record<string, unknown>;
    contentHtml: string;
    isFolder: boolean;
  }) => {
    if (!currentUser) return;
    try {
      const saved = await upsertDoc({ ...data, section }, currentUser.id);
      await loadDocs();
      setMode('view');
      onNavigate(saved.id);
      toast.success(data.id ? 'Article updated' : 'Article created');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      toast.error(code === '23505' ? 'An article with this title already exists in this location.' : 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDocDb(deleteConfirm.id);
      await loadDocs();
      setDeleteConfirm(null);
      if (docId === deleteConfirm.id) onNavigate(undefined);
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const sectionTitle = section === 'help' ? 'Help' : 'Knowledge Base';

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex-1 p-8 space-y-4">
          <div className="h-8 w-64 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-full bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-3/4 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Tree sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">{sectionTitle}</h2>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 z-10" />
            <Input
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              placeholder="Filter..."
              className="pl-8 text-xs"
            />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode('create-doc');
                  onNavigate(undefined);
                }}
              >
                <Plus size={14} className="mr-1" /> Doc
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode('create-folder');
                  onNavigate(undefined);
                }}
              >
                <FolderPlus size={14} className="mr-1" /> Folder
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
          <DocsTreeSidebar
            docs={docs}
            activeId={docId || null}
            onSelect={(doc) => {
              setMode('view');
              onNavigate(doc.id);
            }}
            filter={treeFilter}
          />
        </div>
      </div>

      {/* Right: Content area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
        {mode === 'create-doc' || mode === 'create-folder' ? (
          <DocEditor
            key="new"
            section={section}
            folders={folders}
            onSave={handleSave}
            onCancel={() => setMode('view')}
            isFolder={mode === 'create-folder'}
          />
        ) : mode === 'edit' && activeDoc ? (
          <DocEditor
            key={activeDoc.id}
            doc={activeDoc}
            section={section}
            folders={folders.filter((f) => f.id !== activeDoc.id)}
            onSave={handleSave}
            onCancel={() => setMode('view')}
          />
        ) : activeDoc && !activeDoc.isFolder ? (
          <DocViewer
            doc={activeDoc}
            breadcrumbs={breadcrumbs}
            onEdit={() => setMode('edit')}
            onDelete={() => setDeleteConfirm(activeDoc)}
            onNavigate={(id) => {
              setMode('view');
              onNavigate(id);
            }}
            isAdmin={isAdmin}
          />
        ) : (
          /* Index view — section landing or folder contents */
          <div className="max-w-3xl mx-auto">
            {/* Title */}
            <div className="flex items-start justify-between gap-4 mb-1">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                {activeDoc?.isFolder ? activeDoc.title : sectionTitle}
              </h1>
              {activeDoc?.isFolder && isAdmin && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setMode('edit')}>
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(activeDoc)}>
                    <Trash2 size={14} className="mr-1" /> Delete
                  </Button>
                </div>
              )}
            </div>
            {!activeDoc && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                {section === 'help'
                  ? 'Find answers and learn how to use the platform.'
                  : 'Guides, best practices, and resources for your team.'}
              </p>
            )}
            {activeDoc?.isFolder && <div className="mb-5" />}

            {indexFolders.length === 0 && indexArticles.length === 0 ? (
              /* Truly empty */
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                  <FileText size={28} className="text-zinc-400" />
                </div>
                <h3 className="text-sm font-medium text-zinc-900 dark:text-white mb-1">
                  {activeDoc?.isFolder ? 'This folder is empty' : 'No articles yet'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
                  {isAdmin ? 'Create your first article to get started.' : 'Check back later for new content.'}
                </p>
                {isAdmin && (
                  <Button variant="primary" size="sm" onClick={() => setMode('create-doc')} className="mt-4">
                    <Plus size={14} className="mr-1" /> Create article
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Folder cards */}
                {indexFolders.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {indexFolders.map((folder) => {
                      const count = childCount(folder.id);
                      return (
                        <button
                          key={folder.id}
                          onClick={() => {
                            setMode('view');
                            onNavigate(folder.id);
                          }}
                          className="group text-left p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                              {folder.icon ? (
                                <IconComponent name={folder.icon} size={16} className="text-amber-500" />
                              ) : (
                                <Folder size={16} className="text-amber-500" />
                              )}
                            </div>
                            <ChevronRight
                              size={14}
                              className="ml-auto text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors"
                            />
                          </div>
                          <div className="text-sm font-medium text-zinc-900 dark:text-white">{folder.title}</div>
                          {folder.description && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                              {folder.description}
                            </div>
                          )}
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {count} {count === 1 ? 'article' : 'articles'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Article list */}
                {indexArticles.length > 0 && (
                  <div>
                    {indexFolders.length > 0 && (
                      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Articles</h2>
                    )}
                    <div className="space-y-0.5">
                      {indexArticles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => {
                            setMode('view');
                            onNavigate(article.id);
                          }}
                          className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group"
                        >
                          <FileText size={15} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors truncate">
                                {article.title}
                              </span>
                              <span className="ml-auto text-[11px] text-zinc-300 dark:text-zinc-600 flex-shrink-0">
                                {new Date(article.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                            {article.description && (
                              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                                {article.description}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal — uses Button primitives like Bin.tsx */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.isFolder ? 'Delete folder' : 'Delete article'}
        size="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Are you sure you want to delete &quot;{deleteConfirm?.title}&quot;?
          {deleteConfirm?.isFolder && ' All articles inside this folder will also be deleted.'}
        </p>
      </Modal>
    </div>
  );
};
