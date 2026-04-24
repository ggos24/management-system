import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Trash2,
  Share2,
  Plus,
  X,
  Calendar,
  CheckCircle,
  Layout,
  User as UserIcon,
  Eye,
  Zap,
  Globe,
  Link as LinkIcon,
  Link2,
  Type,
  List as ListIcon,
  Users,
  MoreHorizontal,
  Edit2,
  MessageSquare,
  Send,
  RotateCcw,
  AlertTriangle,
  Tags as TagsIcon,
  History,
} from 'lucide-react';
import { Modal } from './Modal';
import { RichTextEditor } from './RichTextEditor';
import { MultiSelect, MultiSelectOptionGroup } from './MultiSelect';
import { CustomSelect } from './CustomSelect';
import { TagSelect } from './TagSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { Avatar } from './Avatar';
import { Button, Input, Label, Divider } from './ui';
import { useUiStore } from '../stores/uiStore';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { Task, TaskComment, TaskActivity, CustomProperty } from '../types';
import { cn } from '../lib/cn';
import { formatDateEU } from '../lib/utils';
import { PRIORITY_COLORS, PRIORITY_DOT, getStatusColor } from '../constants';
import * as db from '../lib/database';
import { supabase } from '../lib/supabase';

export const TaskModal: React.FC = () => {
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<CustomProperty['type']>('text');
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [editingPropName, setEditingPropName] = useState('');
  const [propMenuId, setPropMenuId] = useState<string | null>(null);
  const { isTaskModalOpen, taskModalData, setIsTaskModalOpen, setTaskModalData } = useUiStore();

  const {
    teams,
    members,
    teamStatuses,
    teamTypes,
    teamProperties,
    allPlacements,
    teamPlacements,
    addTeamPlacement,
    addPlacement,
    saveTask,
    deleteTask,
    addStatus,
    addType,
    updateProperty,
    addProperty,
    deleteProperty,
    taskTeamLinks,
    linkTaskToTeam,
    updateLinkedTaskFields,
  } = useDataStore();

  const currentUser = useAuthStore((s) => s.currentUser);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.id === currentUser?.id ? -1 : b.id === currentUser?.id ? 1 : 0)),
    [members, currentUser?.id],
  );

  // Track initial state to detect unsaved changes
  const initialDataRef = useRef<string>('');

  useEffect(() => {
    if (isTaskModalOpen) {
      initialDataRef.current = JSON.stringify(taskModalData);
    }
  }, [isTaskModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasUnsavedChanges = useCallback(() => {
    return initialDataRef.current !== '' && JSON.stringify(taskModalData) !== initialDataRef.current;
  }, [taskModalData]);

  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState(false);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges()) {
      setIsUnsavedConfirmOpen(true);
      return;
    }
    setIsTaskModalOpen(false);
  }, [hasUnsavedChanges, setIsTaskModalOpen]);

  // --- Grouped placement options with composite values (teamId:name) ---
  const placementGroups = useMemo(() => {
    const homeTeamId = taskModalData.teamId || '';
    const homeTeam = teams.find((t) => t.id === homeTeamId);
    const groups: MultiSelectOptionGroup[] = [];

    const homePlacements = teamPlacements[homeTeamId] || [];
    if (homePlacements.length > 0) {
      groups.push({
        label: homeTeam?.name || 'Current Workspace',
        teamId: homeTeamId,
        highlighted: true,
        options: homePlacements.map((p) => ({ value: `${homeTeamId}:${p}`, label: p })),
      });
    }

    for (const team of teams.filter((t) => !t.archived && !t.hidden && t.id !== homeTeamId)) {
      const placements = teamPlacements[team.id] || [];
      if (placements.length === 0) continue;
      groups.push({
        label: team.name,
        teamId: team.id,
        options: placements.map((p) => ({ value: `${team.id}:${p}`, label: p })),
      });
    }
    return groups;
  }, [taskModalData.teamId, teams, teamPlacements]);

  // O(1) lookup: placement name → list of team IDs that have it
  const placementToTeamIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [teamId, placements] of Object.entries(teamPlacements)) {
      for (const p of placements) {
        const arr = map.get(p);
        if (arr) arr.push(teamId);
        else map.set(p, [teamId]);
      }
    }
    return map;
  }, [teamPlacements]);

  // Convert task's plain placement names to composite keys for the MultiSelect selected state
  const selectedCompositeKeys = useMemo(() => {
    const taskPlacements = taskModalData.placements || [];
    const homeTeamId = taskModalData.teamId || '';
    const keys: string[] = [];
    for (const p of taskPlacements) {
      // Strip existing composite prefixes from corrupted data
      const plainName = p.includes(':') && p.indexOf(':') > 8 ? p.substring(p.indexOf(':') + 1) : p;
      // Check home team first
      if ((teamPlacements[homeTeamId] || []).includes(plainName)) {
        keys.push(`${homeTeamId}:${plainName}`);
        continue;
      }
      // Check foreign teams — only match if the task has a link to that team
      let matched = false;
      const candidateTeamIds = placementToTeamIds.get(plainName) || [];
      for (const teamId of candidateTeamIds) {
        if (teamId === homeTeamId) continue;
        const isLinked = taskModalData.id
          ? taskTeamLinks.some((l) => l.taskId === taskModalData.id && l.teamId === teamId)
          : true;
        if (isLinked) {
          keys.push(`${teamId}:${plainName}`);
          matched = true;
        }
      }
      // Fallback: unmatched placement, show as home
      if (!matched) keys.push(`${homeTeamId}:${plainName}`);
    }
    return keys;
  }, [
    taskModalData.placements,
    taskModalData.teamId,
    taskModalData.id,
    teamPlacements,
    taskTeamLinks,
    placementToTeamIds,
  ]);

  const pendingLinkedTeamIds = useMemo(() => {
    const homeTeamId = taskModalData.teamId || '';
    const foreignTeamIds = new Set<string>();
    for (const key of selectedCompositeKeys) {
      const colonIdx = key.indexOf(':');
      const teamId = key.substring(0, colonIdx);
      if (teamId !== homeTeamId) foreignTeamIds.add(teamId);
    }
    return [...foreignTeamIds];
  }, [selectedCompositeKeys, taskModalData.teamId]);

  // --- Comments & Activity State ---
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const activityLoadedRef = useRef(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Load comments when modal opens with an existing task
  const loadComments = useCallback(async (taskId: string) => {
    setIsLoadingComments(true);
    try {
      const data = await db.fetchTaskComments(taskId);
      setComments(data);
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setIsLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    if (isTaskModalOpen && taskModalData.id) {
      loadComments(taskModalData.id);
    } else {
      setComments([]);
    }
    setCommentText('');
    setEditingCommentId(null);
    setShowMentionDropdown(false);
    setActiveTab('comments');
    setActivities([]);
    activityLoadedRef.current = false;
  }, [isTaskModalOpen, taskModalData.id, loadComments]);

  // Lazy-load activity when tab is first activated
  useEffect(() => {
    if (activeTab === 'activity' && taskModalData.id && !activityLoadedRef.current) {
      setIsLoadingActivities(true);
      db.fetchTaskActivity(taskModalData.id)
        .then((data) => {
          activityLoadedRef.current = true;
          setActivities(data);
        })
        .catch(() => toast.error('Failed to load activity'))
        .finally(() => setIsLoadingActivities(false));
    }
  }, [activeTab, taskModalData.id]);

  // Realtime subscription for comments on the open task
  useEffect(() => {
    if (!isTaskModalOpen || !taskModalData.id) return;
    const channel = supabase
      .channel(`task-comments-${taskModalData.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskModalData.id}` },
        () => {
          db.fetchTaskComments(taskModalData.id!).then(setComments).catch(console.error);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isTaskModalOpen, taskModalData.id]);

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  // Parse @mentions from text, return matched member IDs
  const parseMentions = useCallback(
    (text: string): string[] => {
      const mentionRegex = /@(\S+)/g;
      const mentioned: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        const name = match[1].toLowerCase();
        const member = members.find((m) => m.name.toLowerCase().replace(/\s+/g, '') === name);
        if (member) mentioned.push(member.id);
      }
      return [...new Set(mentioned)];
    },
    [members],
  );

  const handleAddComment = async () => {
    if (!commentText.trim() || !taskModalData.id || !currentUser) return;
    const text = commentText.trim();
    setCommentText('');
    setShowMentionDropdown(false);
    try {
      const newComment = await db.insertTaskComment(taskModalData.id, currentUser.id, text);
      setComments((prev) => [...prev, newComment]);
      // Send notifications for @mentions
      const mentionedIds = parseMentions(text);
      if (mentionedIds.length > 0) {
        const { notifyMention } = useDataStore.getState();
        notifyMention(
          mentionedIds,
          currentUser.name,
          taskModalData.title || 'Untitled',
          taskModalData.id!,
          taskModalData.teamId!,
        );
      }
    } catch {
      toast.error('Failed to add comment');
      setCommentText(text);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return;
    try {
      const updated = await db.updateTaskComment(commentId, editingCommentText.trim());
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingCommentId(null);
    } catch {
      toast.error('Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await db.deleteTaskComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  // Handle @mention input
  const handleCommentInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);
    const cursor = e.target.selectionStart;
    // Find if we're typing after an @
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\S*)$/);
    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionFilter(atMatch[1].toLowerCase());
      setMentionCursorPos(cursor);
    } else {
      setShowMentionDropdown(false);
    }
  };

  const insertMention = (memberName: string) => {
    const textBefore = commentText.slice(0, mentionCursorPos);
    const atIdx = textBefore.lastIndexOf('@');
    const newText =
      commentText.slice(0, atIdx) + '@' + memberName.replace(/\s+/g, '') + ' ' + commentText.slice(mentionCursorPos);
    setCommentText(newText);
    setShowMentionDropdown(false);
    commentInputRef.current?.focus();
  };

  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(mentionFilter));

  // Render comment text with highlighted @mentions
  const renderCommentContent = (text: string) => {
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
  };

  const formatCommentTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return formatDateEU(d);
  };

  const renderActivityDescription = (a: TaskActivity): React.ReactNode => {
    const bold = (text: string) => <span className="font-medium text-zinc-700 dark:text-zinc-200">{text}</span>;
    const formatDate = (v: string) => {
      try {
        return formatDateEU(v);
      } catch {
        return v;
      }
    };
    const resolveNames = (idsJson: string): string => {
      try {
        const ids: string[] = JSON.parse(idsJson);
        return ids.map((id) => members.find((m) => m.id === id)?.name || 'Unknown').join(', ');
      } catch {
        return idsJson;
      }
    };

    switch (a.field) {
      case 'created':
        return 'created this task';
      case 'deleted':
        return 'moved to bin';
      case 'restored':
        return 'restored from bin';
      case 'title':
        return (
          <>
            changed title from {bold(a.oldValue || '')} to {bold(a.newValue || '')}
          </>
        );
      case 'status':
        return <>changed status to {bold(a.newValue || '')}</>;
      case 'priority':
        return (
          <>
            changed priority from {bold(a.oldValue || '')} to {bold(a.newValue || '')}
          </>
        );
      case 'dueDate':
        return (
          <>
            changed due date from {bold(a.oldValue ? formatDate(a.oldValue) : 'none')} to{' '}
            {bold(a.newValue ? formatDate(a.newValue) : 'none')}
          </>
        );
      case 'assignees':
        return (
          <>
            updated assignees from {bold(a.oldValue ? resolveNames(a.oldValue) : 'none')} to{' '}
            {bold(a.newValue ? resolveNames(a.newValue) : 'none')}
          </>
        );
      case 'description':
        return 'updated description';
      case 'placements':
        return 'updated placements';
      case 'contentInfo':
        return 'updated content info';
      case 'customFields':
        return 'updated custom fields';
      default:
        return `updated ${a.field}`;
    }
  };

  const handleSaveTask = () => {
    if (!taskModalData.title?.trim()) {
      toast.error('Title is required');
      return;
    }
    const isNew = !taskModalData.id;
    const taskId = isNew ? crypto.randomUUID() : taskModalData.id!;
    const dataToSave = isNew ? { ...taskModalData, id: taskId } : taskModalData;

    saveTask(dataToSave, teams);

    // Link to foreign workspaces (derived from selected placements)
    if (isNew && pendingLinkedTeamIds.length > 0) {
      for (const teamId of pendingLinkedTeamIds) {
        linkTaskToTeam(taskId, teamId);
      }
    }

    setIsTaskModalOpen(false);
  };

  const { restoreTask } = useDataStore();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDeleteTask = (taskId: string) => {
    setPendingDeleteId(taskId);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteTask = () => {
    if (pendingDeleteId) {
      deleteTask(pendingDeleteId);
      setIsDeleteConfirmOpen(false);
      setPendingDeleteId(null);
      setIsTaskModalOpen(false);
    }
  };

  const [linkCopied, setLinkCopied] = useState(false);

  const handleShareTask = () => {
    if (!taskModalData.id) {
      toast.warning('Please create the task first before sharing.');
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?task=${taskModalData.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        toast.error('Could not copy link');
      });
  };

  // --- Links State ---
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [editingLinkIdx, setEditingLinkIdx] = useState<number | null>(null);
  const [editLinkTitle, setEditLinkTitle] = useState('');
  const [editLinkUrl, setEditLinkUrl] = useState('');

  const handleAddLink = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    const title = newLinkTitle.trim() || url;
    setTaskModalData((prev: Partial<Task>) => ({
      ...prev,
      links: [...(prev.links || []), { title, url }],
    }));
    setNewLinkTitle('');
    setNewLinkUrl('');
    setIsAddingLink(false);
  };

  const handleSaveEditLink = (idx: number) => {
    const url = editLinkUrl.trim();
    if (!url) return;
    const title = editLinkTitle.trim() || url;
    setTaskModalData((prev: Partial<Task>) => {
      const newLinks = [...(prev.links || [])];
      newLinks[idx] = { title, url };
      return { ...prev, links: newLinks };
    });
    setEditingLinkIdx(null);
  };

  const handleRemoveLink = (idx: number) => {
    setTaskModalData((prev: Partial<Task>) => {
      const newLinks = [...(prev.links || [])];
      newLinks.splice(idx, 1);
      return { ...prev, links: newLinks };
    });
  };

  const isManagement = teams
    .find((t) => t.id === taskModalData.teamId)
    ?.name.toLowerCase()
    .includes('management');
  const getAuthorLabel = () => (isManagement ? 'Executive' : 'Author');
  const getEditorLabel = () => (isManagement ? 'Manager' : 'Editor');

  return (
    <Modal
      isOpen={isTaskModalOpen}
      onClose={handleClose}
      title=""
      headerActions={
        <div className="flex gap-1 md:gap-2 mr-1 md:mr-2 relative">
          <button
            onClick={() => handleDeleteTask(taskModalData.id!)}
            aria-label="Delete Task"
            className={`h-11 w-11 md:h-9 md:w-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors ${!taskModalData.id ? 'hidden' : ''}`}
          >
            <Trash2 size={18} />
          </button>
          <div className="relative">
            <button
              onClick={handleShareTask}
              aria-label="Copy link"
              className="h-11 w-11 md:h-9 md:w-9 flex items-center justify-center text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              {linkCopied ? <CheckCircle size={18} className="text-emerald-500" /> : <Share2 size={18} />}
            </button>
            {linkCopied && (
              <div className="absolute top-full right-0 mt-1 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded whitespace-nowrap">
                Link copied
              </div>
            )}
          </div>
        </div>
      }
      actions={
        taskModalData.deletedAt ? (
          <>
            <Button variant="ghost" onClick={() => setIsTaskModalOpen(false)}>
              Close
            </Button>
            <Button
              className="inline-flex items-center"
              onClick={() => {
                restoreTask(taskModalData.id!);
                setIsTaskModalOpen(false);
              }}
            >
              <RotateCcw size={14} className="mr-1.5" />
              Restore
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSaveTask}>{taskModalData.id ? 'Save Changes' : 'Create Task'}</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-6">
        {/* Deleted task banner */}
        {taskModalData.deletedAt && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                This task is in the bin.{' '}
                {taskModalData.deletedBy && (
                  <span>
                    Deleted by{' '}
                    <span className="font-medium">
                      {members.find((m) => m.id === taskModalData.deletedBy)?.name || 'Unknown'}
                    </span>{' '}
                    on {formatDateEU(taskModalData.deletedAt)}.
                  </span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              className="inline-flex items-center"
              onClick={() => {
                restoreTask(taskModalData.id!);
                setIsTaskModalOpen(false);
              }}
            >
              <RotateCcw size={14} className="mr-1.5" />
              Restore
            </Button>
          </div>
        )}

        <div className={taskModalData.deletedAt ? 'pointer-events-none opacity-60 space-y-6' : 'space-y-6'}>
          <input
            type="text"
            placeholder="Task Title"
            value={taskModalData.title || ''}
            onChange={(e) => setTaskModalData({ ...taskModalData, title: e.target.value })}
            className="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder-zinc-300 dark:placeholder-zinc-700"
            autoFocus={!taskModalData.deletedAt && !taskModalData.id}
          />

          <RichTextEditor
            value={taskModalData.description || ''}
            onChange={(html) => setTaskModalData({ ...taskModalData, description: html })}
            placeholder="Description..."
            minHeight="120px"
          />

          <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 md:gap-x-8 gap-y-4 md:gap-y-5">
              <CustomSelect
                icon={CheckCircle}
                label="Section"
                hint="Current workflow stage of this task"
                options={teamStatuses[taskModalData.teamId || 'default'] || teamStatuses['default'] || ['To Do']}
                value={taskModalData.status || ''}
                onChange={(val) => setTaskModalData({ ...taskModalData, status: val })}
                onAdd={(val) => {
                  addStatus(taskModalData.teamId || 'default', val);
                  setTaskModalData({ ...taskModalData, status: val });
                }}
              />
              <CustomSelect
                icon={Layout}
                label="Content Type"
                hint="Format or medium of the content"
                options={teamTypes[taskModalData.teamId || 'default'] || teamTypes['default'] || ['General']}
                value={taskModalData.contentInfo?.type || ''}
                onChange={(val) =>
                  setTaskModalData({ ...taskModalData, contentInfo: { ...taskModalData.contentInfo!, type: val } })
                }
                onAdd={(val) => {
                  addType(taskModalData.teamId || 'default', val);
                  setTaskModalData({ ...taskModalData, contentInfo: { ...taskModalData.contentInfo!, type: val } });
                }}
              />
              <MultiSelect
                icon={UserIcon}
                label={getAuthorLabel()}
                hint={isManagement ? 'Person responsible for execution' : 'Person who creates the content'}
                options={sortedMembers.map((m) => ({ value: m.id, label: m.name }))}
                selected={taskModalData.assigneeIds || []}
                onChange={(ids) => setTaskModalData({ ...taskModalData, assigneeIds: ids })}
                placeholder={`Select ${getAuthorLabel()}...`}
                searchable
                highlightValue={currentUser?.id}
              />
              <MultiSelect
                icon={Eye}
                label={getEditorLabel()}
                hint={isManagement ? 'Person who oversees the task' : 'Person who reviews and approves'}
                options={sortedMembers.map((m) => ({ value: m.id, label: m.name }))}
                selected={taskModalData.contentInfo?.editorIds || []}
                onChange={(ids) =>
                  setTaskModalData({ ...taskModalData, contentInfo: { ...taskModalData.contentInfo!, editorIds: ids } })
                }
                placeholder={`Select ${getEditorLabel()}...`}
                searchable
                highlightValue={currentUser?.id}
              />

              <CustomSelect
                icon={Zap}
                label="Priority"
                hint="Urgency level for scheduling"
                options={['low', 'medium', 'high']}
                value={taskModalData.priority || 'medium'}
                onChange={(val) => setTaskModalData({ ...taskModalData, priority: val as Task['priority'] })}
                renderValue={(v) => (
                  <span className={`capitalize inline-flex items-center gap-1.5 ${PRIORITY_COLORS[v] || ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[v] || 'bg-zinc-400'}`} />
                    {v}
                  </span>
                )}
              />
              <div className="space-y-1">
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Calendar size={12} /> Due Date
                  </label>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Target completion deadline</p>
                </div>
                <SimpleDatePicker
                  value={taskModalData.dueDate ? taskModalData.dueDate.split('T')[0] : ''}
                  onChange={(date) =>
                    setTaskModalData({ ...taskModalData, dueDate: date ? new Date(date).toISOString() : '' })
                  }
                  placeholder="Set due date"
                />
              </div>
              <div className="space-y-1">
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <CheckCircle size={12} /> Pub Date
                  </label>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Actual date of publication</p>
                </div>
                <SimpleDatePicker
                  value={taskModalData.doneDate ? taskModalData.doneDate.split('T')[0] : ''}
                  onChange={(date) =>
                    setTaskModalData({ ...taskModalData, doneDate: date ? new Date(date).toISOString() : null })
                  }
                  placeholder="Set publish date"
                />
              </div>
              <div>
                <MultiSelect
                  icon={Globe}
                  label="Placements"
                  hint="Channels where this content will be published"
                  groups={placementGroups}
                  selected={selectedCompositeKeys}
                  onChange={(compositeKeys) => {
                    // Extract plain placement names from composite keys, stripping any corrupted prefixes
                    const plainNames = compositeKeys.map((k) => {
                      const idx = k.indexOf(':');
                      const raw = k.substring(idx + 1);
                      // Strip nested composite prefix from corrupted data
                      const innerIdx = raw.indexOf(':');
                      return innerIdx > 8 ? raw.substring(innerIdx + 1) : raw;
                    });
                    setTaskModalData({ ...taskModalData, placements: plainNames });
                  }}
                  onToggleWithGroup={(compositeValue, isSelected, group) => {
                    const _placementName = compositeValue.substring(compositeValue.indexOf(':') + 1);
                    // Derive new placements from composite keys
                    const newKeys = isSelected
                      ? [...selectedCompositeKeys, compositeValue]
                      : selectedCompositeKeys.filter((k) => k !== compositeValue);
                    const newPlacements = newKeys.map((k) => k.substring(k.indexOf(':') + 1));
                    setTaskModalData({ ...taskModalData, placements: newPlacements });

                    // If editing existing task and selecting a foreign placement, link immediately
                    if (isSelected && group.teamId !== taskModalData.teamId && taskModalData.id) {
                      const alreadyLinked = taskTeamLinks.some(
                        (l) => l.taskId === taskModalData.id && l.teamId === group.teamId,
                      );
                      if (!alreadyLinked) linkTaskToTeam(taskModalData.id, group.teamId);
                    }
                  }}
                  onAdd={(newTag) => {
                    const teamId = taskModalData.teamId || '';
                    if (teamId) addTeamPlacement(teamId, newTag);
                    if (!allPlacements.includes(newTag)) addPlacement(newTag);
                    setTaskModalData({ ...taskModalData, placements: [...(taskModalData.placements || []), newTag] });
                  }}
                  placeholder="Add placements..."
                />
              </div>
              {!taskModalData.id && pendingLinkedTeamIds.length > 0 && (
                <div className="md:col-span-2">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-zinc-400">Will also appear in:</span>
                    {pendingLinkedTeamIds.map((teamId) => {
                      const team = teams.find((t) => t.id === teamId);
                      return team ? (
                        <span
                          key={teamId}
                          className="inline-flex items-center text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5"
                        >
                          {team.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Workspace status overview card */}
              {taskModalData.id && taskTeamLinks.filter((l) => l.taskId === taskModalData.id).length > 0 && (
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-2">
                    <Link2 size={12} /> Section per Workspace
                  </label>
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
                    {/* Home workspace */}
                    {(() => {
                      const homeTeam = teams.find((t) => t.id === taskModalData.teamId);
                      return homeTeam ? (
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{homeTeam.name}</span>
                          <span
                            className={`text-[11px] font-medium rounded-full px-2 py-0.5 border ${getStatusColor(taskModalData.status || '')}`}
                          >
                            {taskModalData.status}
                          </span>
                        </div>
                      ) : null;
                    })()}
                    {/* Linked workspaces */}
                    {taskTeamLinks
                      .filter((l) => l.taskId === taskModalData.id)
                      .map((link) => {
                        const linkedTeam = teams.find((t) => t.id === link.teamId);
                        if (!linkedTeam) return null;
                        return (
                          <div key={link.id} className="flex items-center justify-between px-3 py-2">
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                              {linkedTeam.name}
                            </span>
                            <span
                              className={`text-[11px] font-medium rounded-full px-2 py-0.5 border ${getStatusColor(link.status)}`}
                            >
                              {link.status}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Custom Properties Inputs */}
              {(() => {
                const viewingTeamId = (taskModalData as any).viewingTeamId as string | undefined;
                const isViewingLinkedTeam =
                  viewingTeamId &&
                  viewingTeamId !== taskModalData.teamId &&
                  taskTeamLinks.some((l) => l.taskId === taskModalData.id && l.teamId === viewingTeamId);
                const propsTeamId = isViewingLinkedTeam ? viewingTeamId : taskModalData.teamId || 'default';
                const props = teamProperties[propsTeamId] || [];
                const fieldValues = isViewingLinkedTeam
                  ? taskTeamLinks.find((l) => l.taskId === taskModalData.id && l.teamId === viewingTeamId)
                      ?.customFieldValues || {}
                  : taskModalData.customFieldValues || {};

                const handleFieldChange = (propId: string, value: any) => {
                  if (isViewingLinkedTeam && taskModalData.id) {
                    updateLinkedTaskFields(taskModalData.id, viewingTeamId!, { ...fieldValues, [propId]: value });
                  } else {
                    setTaskModalData({
                      ...taskModalData,
                      customFieldValues: { ...taskModalData.customFieldValues, [propId]: value },
                    });
                  }
                };

                return props.map((prop) => (
                  <div key={prop.id} className="space-y-1 relative">
                    <div className="flex items-center justify-between group/prop">
                      {editingPropId === prop.id ? (
                        <input
                          autoFocus
                          className="text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 outline-none w-full"
                          value={editingPropName}
                          onChange={(e) => setEditingPropName(e.target.value)}
                          onBlur={() => {
                            if (editingPropName.trim()) {
                              updateProperty(propsTeamId, {
                                ...prop,
                                name: editingPropName.trim(),
                              });
                            }
                            setEditingPropId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingPropName.trim()) {
                                updateProperty(propsTeamId, {
                                  ...prop,
                                  name: editingPropName.trim(),
                                });
                              }
                              setEditingPropId(null);
                            }
                            if (e.key === 'Escape') setEditingPropId(null);
                          }}
                        />
                      ) : (
                        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 capitalize">
                          {prop.name}
                        </label>
                      )}
                      {editingPropId !== prop.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPropMenuId(propMenuId === prop.id ? null : prop.id);
                          }}
                          className="opacity-100 md:opacity-0 md:group-hover/prop:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-opacity p-0.5"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      )}
                    </div>
                    {propMenuId === prop.id && (
                      <div className="absolute right-0 top-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1 w-44">
                        <button
                          onClick={() => {
                            setEditingPropId(prop.id);
                            setEditingPropName(prop.name);
                            setPropMenuId(null);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs"
                        >
                          <Edit2 size={12} /> Rename
                        </button>
                        <Divider className="my-1" />
                        <p className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase">Change Type</p>
                        {[
                          { type: 'text' as const, icon: Type, label: 'Text' },
                          { type: 'select' as const, icon: ListIcon, label: 'Select' },
                          { type: 'tags' as const, icon: TagsIcon, label: 'Tags' },
                          { type: 'date' as const, icon: Calendar, label: 'Date' },
                          { type: 'person' as const, icon: Users, label: 'Person' },
                        ].map(({ type, icon: Icon, label }) => (
                          <button
                            key={type}
                            onClick={() => {
                              updateProperty(propsTeamId, { ...prop, type });
                              setPropMenuId(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs ${prop.type === type ? 'text-black dark:text-white font-medium' : ''}`}
                          >
                            <Icon size={12} /> {label} {prop.type === type && '(current)'}
                          </button>
                        ))}
                        <Divider className="my-1" />
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${prop.name}" property?`)) {
                              deleteProperty(propsTeamId, prop.id);
                            }
                            setPropMenuId(null);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs text-red-500"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                    {prop.type === 'text' && (
                      <Input
                        value={fieldValues[prop.id] || ''}
                        onChange={(e) => handleFieldChange(prop.id, e.target.value)}
                      />
                    )}
                    {prop.type === 'date' && (
                      <SimpleDatePicker
                        value={fieldValues[prop.id] || ''}
                        onChange={(date) => handleFieldChange(prop.id, date)}
                        placeholder="Select Date"
                      />
                    )}
                    {prop.type === 'select' && (
                      <CustomSelect
                        options={prop.options?.map((o) => ({ value: o, label: o })) || []}
                        value={fieldValues[prop.id] || ''}
                        onChange={(val) => handleFieldChange(prop.id, val)}
                        placeholder="Select..."
                        onAdd={(val) => {
                          updateProperty(propsTeamId, {
                            ...prop,
                            options: [...(prop.options || []), val],
                          });
                          handleFieldChange(prop.id, val);
                        }}
                      />
                    )}
                    {prop.type === 'person' && (
                      <CustomSelect
                        options={sortedMembers.map((m) => ({ value: m.id, label: m.name }))}
                        value={fieldValues[prop.id] || ''}
                        onChange={(val) => handleFieldChange(prop.id, val)}
                        placeholder="Select person..."
                        searchable
                        highlightValue={currentUser?.id}
                      />
                    )}
                    {prop.type === 'tags' && (
                      <TagSelect
                        tags={prop.options || []}
                        selected={(() => {
                          const val = fieldValues[prop.id];
                          return Array.isArray(val) ? val : val ? [val] : [];
                        })()}
                        tagColors={prop.optionColors || {}}
                        onChange={(tags) => handleFieldChange(prop.id, tags)}
                        onAddTag={(name, color) => {
                          updateProperty(propsTeamId, {
                            ...prop,
                            options: [...(prop.options || []), name],
                            optionColors: { ...(prop.optionColors || {}), [name]: color },
                          });
                        }}
                        onUpdateTagColor={(name, color) => {
                          updateProperty(propsTeamId, {
                            ...prop,
                            optionColors: { ...(prop.optionColors || {}), [name]: color },
                          });
                        }}
                        onDeleteTag={(name) => {
                          const newColors = { ...(prop.optionColors || {}) };
                          delete newColors[name];
                          updateProperty(propsTeamId, {
                            ...prop,
                            options: (prop.options || []).filter((o) => o !== name),
                            optionColors: newColors,
                          });
                          const val = fieldValues[prop.id];
                          const currentTags = Array.isArray(val) ? val : val ? [val] : [];
                          if (currentTags.includes(name)) {
                            handleFieldChange(
                              prop.id,
                              currentTags.filter((t: string) => t !== name),
                            );
                          }
                        }}
                        placeholder="Select tags..."
                      />
                    )}
                  </div>
                ));
              })()}

              <div className="md:col-span-2 relative">
                {isAddPropertyOpen ? (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-900 dark:text-white">New Property</h4>
                      <button onClick={() => setIsAddPropertyOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                        <X size={14} />
                      </button>
                    </div>
                    <Input
                      placeholder="Property Name"
                      value={newPropName}
                      onChange={(e) => setNewPropName(e.target.value)}
                      autoFocus
                    />
                    <div className="space-y-1">
                      {[
                        { type: 'text' as const, icon: Type, label: 'Text' },
                        { type: 'select' as const, icon: ListIcon, label: 'Select' },
                        { type: 'tags' as const, icon: TagsIcon, label: 'Tags' },
                        { type: 'date' as const, icon: Calendar, label: 'Date' },
                        { type: 'person' as const, icon: Users, label: 'Person' },
                      ].map(({ type, icon: Icon, label }) => (
                        <button
                          key={type}
                          onClick={() => setNewPropType(type)}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === type ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                        >
                          <Icon size={12} /> {label}
                        </button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        if (!newPropName || !addProperty) return;
                        const vtId = (taskModalData as any).viewingTeamId;
                        const propTeam =
                          vtId &&
                          vtId !== taskModalData.teamId &&
                          taskTeamLinks.some((l) => l.taskId === taskModalData.id && l.teamId === vtId)
                            ? vtId
                            : taskModalData.teamId || 'default';
                        addProperty(propTeam, {
                          id: crypto.randomUUID(),
                          name: newPropName,
                          type: newPropType,
                          options: [],
                        });
                        setNewPropName('');
                        setIsAddPropertyOpen(false);
                      }}
                    >
                      Create
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddPropertyOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium transition-colors"
                  >
                    <Plus size={14} /> Add Property
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Comments & Activity Section */}
          {taskModalData.id && (
            <div className="space-y-3">
              {/* Tab switcher */}
              <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    activeTab === 'comments'
                      ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
                  )}
                >
                  <MessageSquare size={12} /> Comments{comments.length > 0 ? ` (${comments.length})` : ''}
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    activeTab === 'activity'
                      ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
                  )}
                >
                  <History size={12} /> Activity
                </button>
              </div>

              {/* Comments tab */}
              {activeTab === 'comments' && (
                <>
                  {/* Comment list */}
                  <div className="max-h-[min(300px,50dvh)] overflow-y-auto custom-scrollbar space-y-3">
                    {isLoadingComments ? (
                      <p className="text-xs text-zinc-400 italic py-4 text-center">Loading comments...</p>
                    ) : comments.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic py-4 text-center">No comments yet</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="flex gap-2.5 group/comment">
                          <Avatar
                            src={c.userAvatar || ''}
                            alt={c.userName || ''}
                            size="sm"
                            className="flex-shrink-0 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-zinc-900 dark:text-white">{c.userName}</span>
                              <span className="text-[11px] md:text-[10px] text-zinc-400">
                                {formatCommentTime(c.createdAt)}
                              </span>
                              {c.updatedAt && (
                                <span className="text-[11px] md:text-[10px] text-zinc-400 italic">(edited)</span>
                              )}
                              {currentUser && (currentUser.id === c.userId || currentUser.role === 'admin') && (
                                <div className="opacity-100 md:opacity-0 md:group-hover/comment:opacity-100 flex items-center gap-1 ml-auto transition-opacity">
                                  {currentUser.id === c.userId && (
                                    <button
                                      onClick={() => {
                                        setEditingCommentId(c.id);
                                        setEditingCommentText(c.content);
                                      }}
                                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteComment(c.id)}
                                    className="text-zinc-400 hover:text-red-500"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                            {editingCommentId === c.id ? (
                              <div className="space-y-1.5">
                                <textarea
                                  autoFocus
                                  className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-zinc-400 resize-none"
                                  rows={2}
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleUpdateComment(c.id);
                                    }
                                    if (e.key === 'Escape') setEditingCommentId(null);
                                  }}
                                />
                                <div className="flex gap-1.5">
                                  <Button size="sm" onClick={() => handleUpdateComment(c.id)}>
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                                {renderCommentContent(c.content)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={commentsEndRef} />
                  </div>

                  {/* Add comment input */}
                  <div className="flex gap-2.5 items-start">
                    {currentUser && (
                      <Avatar
                        src={currentUser.avatar}
                        alt={currentUser.name}
                        size="sm"
                        className="flex-shrink-0 mt-1.5"
                      />
                    )}
                    <div className="flex-1 space-y-2 relative">
                      <textarea
                        ref={commentInputRef}
                        className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 resize-none placeholder-zinc-400"
                        rows={2}
                        placeholder="Write a comment... Use @ to mention someone"
                        value={commentText}
                        onChange={handleCommentInput}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                      />
                      {/* @mention dropdown */}
                      {showMentionDropdown && filteredMembers.length > 0 && (
                        <div className="absolute left-0 bottom-full mb-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                          {filteredMembers.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => insertMention(m.name)}
                              className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs"
                            >
                              <Avatar src={m.avatar} alt={m.name} size="sm" />
                              <span className="text-zinc-900 dark:text-white">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={handleAddComment}
                          disabled={!commentText.trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send size={12} />
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Activity tab */}
              {activeTab === 'activity' && (
                <div className="max-h-[min(300px,50dvh)] overflow-y-auto custom-scrollbar space-y-2.5">
                  {isLoadingActivities ? (
                    <p className="text-xs text-zinc-400 italic py-4 text-center">Loading activity...</p>
                  ) : activities.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic py-4 text-center">No activity yet</p>
                  ) : (
                    activities.map((a) => (
                      <div key={a.id} className="flex gap-2.5 items-start">
                        <Avatar
                          src={a.userAvatar || ''}
                          alt={a.userName || ''}
                          size="sm"
                          className="flex-shrink-0 mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-white">{a.userName}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {renderActivityDescription(a)}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400">{formatCommentTime(a.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label variant="section" className="flex items-center gap-2">
              <LinkIcon size={12} /> Links
              {taskModalData.links && taskModalData.links.length > 0 && (
                <span className="text-[10px] text-zinc-400 font-normal">({taskModalData.links.length})</span>
              )}
            </Label>

            {/* Links list */}
            {taskModalData.links && taskModalData.links.length > 0 && (
              <div className="space-y-1.5">
                {taskModalData.links.map((link, idx) =>
                  editingLinkIdx === idx ? (
                    <div
                      key={idx}
                      className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 space-y-2"
                    >
                      <Input
                        placeholder="Title (optional)"
                        value={editLinkTitle}
                        onChange={(e) => setEditLinkTitle(e.target.value)}
                        autoFocus
                      />
                      <Input
                        placeholder="https://..."
                        value={editLinkUrl}
                        onChange={(e) => setEditLinkUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditLink(idx);
                          if (e.key === 'Escape') setEditingLinkIdx(null);
                        }}
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => handleSaveEditLink(idx)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingLinkIdx(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 group/link transition-colors"
                    >
                      <LinkIcon size={14} className="text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {link.title || link.url}
                        </a>
                        {link.title && <span className="text-[10px] text-zinc-400 truncate block">{link.url}</span>}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover/link:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingLinkIdx(idx);
                            setEditLinkTitle(link.title);
                            setEditLinkUrl(link.url);
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleRemoveLink(idx)}
                          className="p-1 text-zinc-400 hover:text-red-500 rounded"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            {/* Add link form */}
            {isAddingLink ? (
              <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 space-y-2">
                <Input
                  placeholder="https://..."
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLink();
                    if (e.key === 'Escape') {
                      setIsAddingLink(false);
                      setNewLinkTitle('');
                      setNewLinkUrl('');
                    }
                  }}
                  autoFocus
                />
                <Input
                  placeholder="Title (optional)"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLink();
                  }}
                />
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={handleAddLink} disabled={!newLinkUrl.trim()}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsAddingLink(false);
                      setNewLinkTitle('');
                      setNewLinkUrl('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingLink(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium transition-colors"
              >
                <Plus size={14} /> Add Link
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Move to Bin"
        size="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteTask}>
              Move to Bin
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This task will be moved to the bin and can be restored within 30 days.
        </p>
      </Modal>

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        isOpen={isUnsavedConfirmOpen}
        onClose={() => setIsUnsavedConfirmOpen(false)}
        title="Unsaved Changes"
        size="sm"
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setIsUnsavedConfirmOpen(false);
                setIsTaskModalOpen(false);
              }}
            >
              Discard
            </Button>
            <Button
              onClick={() => {
                setIsUnsavedConfirmOpen(false);
                handleSaveTask();
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You have unsaved changes. Would you like to save them before closing?
        </p>
      </Modal>
    </Modal>
  );
};
