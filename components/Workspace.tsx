import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Task, TaskStatus, TeamType, Member, Priority, CustomProperty, TaskTeamLink, UserRole } from '../types';
import { PRIORITY_COLORS, PRIORITY_DOT, getStatusAccent, getDeadlineUrgency, isAdminOrAbove } from '../constants';
import {
  Plus,
  MoreHorizontal,
  Calendar as CalendarIcon,
  User,
  LayoutGrid,
  List,
  Filter,
  ChevronLeft,
  ChevronRight,
  Hash,
  X,
  ChevronDown,
  CheckCircle,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
  FileText,
  Paperclip,
  ChevronUp,
  Link as LinkIcon,
  MapPin,
  Copy,
  Archive,
  FolderArchive,
  Type,
  List as ListIcon,
  Users,
  ArrowLeftRight,
  Check,
  ArrowRight,
  Tags as TagsIcon,
  Link2,
} from 'lucide-react';
import { generateContentIdeas } from '../services/geminiService';
import { Modal } from './Modal';
import { MultiSelect } from './MultiSelect';
import { CustomSelect } from './CustomSelect';
import { TagSelect, getTagColorClasses } from './TagSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { Avatar } from './Avatar';
import { Button, Badge, Divider } from './ui';

// Known service favicon URLs (Google's favicon API returns generic icons for subdomains)
const KNOWN_FAVICONS: { match: (hostname: string, pathname: string) => boolean; icon: string }[] = [
  {
    match: (h, p) => h === 'docs.google.com' && p.startsWith('/document'),
    icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico',
  },
  {
    match: (h, p) => h === 'docs.google.com' && p.startsWith('/spreadsheets'),
    icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico',
  },
  {
    match: (h, p) => h === 'docs.google.com' && p.startsWith('/presentation'),
    icon: 'https://ssl.gstatic.com/docs/presentations/images/favicon5.ico',
  },
  {
    match: (h, p) => h === 'docs.google.com' && p.startsWith('/forms'),
    icon: 'https://ssl.gstatic.com/docs/spreadsheets/forms/favicon_qp2.png',
  },
  {
    match: (h) => h === 'drive.google.com',
    icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png',
  },
  {
    match: (h) => h === 'calendar.google.com',
    icon: 'https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico',
  },
  {
    match: (h) => h === 'meet.google.com',
    icon: 'https://fonts.gstatic.com/s/i/productlogos/meet_2020q4/v1/web-16dp/logo_meet_2020q4_color_1x_web_16dp.png',
  },
  { match: (h) => h === 'sheets.google.com', icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico' },
  { match: (h) => h === 'slides.google.com', icon: 'https://ssl.gstatic.com/docs/presentations/images/favicon5.ico' },
];

const getFaviconUrl = (url: string, hostname: string): string => {
  try {
    const parsed = new URL(url);
    const match = KNOWN_FAVICONS.find((f) => f.match(parsed.hostname, parsed.pathname));
    if (match) return match.icon;
  } catch {
    /* ignore */
  }
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
};

// Shared column context menu used in both board and table views
const ColumnMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDuplicateEmpty: () => void;
  onDuplicateWithData: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
  onToggleArchiveCategory: () => void;
  isArchived: boolean;
  isDone: boolean;
  isArchiveCategory: boolean;
  triggerKey: string;
  triggerRefs: React.RefObject<Record<string, HTMLButtonElement | null>>;
}> = ({
  isOpen,
  onClose,
  onRename,
  onDuplicateEmpty,
  onDuplicateWithData,
  onArchive,
  onDelete,
  onToggleDone,
  onToggleArchiveCategory,
  isArchived,
  isDone,
  isArchiveCategory,
  triggerKey,
  triggerRefs,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const getPos = () => {
    const el = triggerRefs.current[triggerKey];
    if (!el) return { top: 0, left: 0 };
    const rect = el.getBoundingClientRect();
    const menuWidth = 192;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    return { top: rect.bottom + 4, left };
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const pos = getPos();
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left }}
      className="w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[10000] py-1 flex flex-col text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onRename}
        className="text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
      >
        <Edit2 size={12} /> Rename
      </button>
      <button
        onClick={onDuplicateEmpty}
        className="text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
      >
        <Copy size={12} /> Duplicate (Empty)
      </button>
      <button
        onClick={onDuplicateWithData}
        className="text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
      >
        <Copy size={12} /> Duplicate (With Data)
      </button>
      <Divider className="my-1" />
      <button
        onClick={onToggleDone}
        className={`text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${isDone ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
      >
        <CheckCircle size={12} /> {isDone ? 'Unmark as Done' : 'Mark as Done'}
      </button>
      <button
        onClick={onToggleArchiveCategory}
        className={`text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 ${isArchiveCategory ? 'text-zinc-500 dark:text-zinc-400' : ''}`}
      >
        <Archive size={12} /> {isArchiveCategory ? 'Unmark as Archive' : 'Mark as Archive'}
      </button>
      <button
        onClick={onArchive}
        className="text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-yellow-600 dark:text-yellow-400"
      >
        <Archive size={12} /> {isArchived ? 'Unarchive' : 'Archive'}
      </button>
      <button
        onClick={onDelete}
        className="text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-red-600"
      >
        <Trash2 size={12} /> Delete
      </button>
    </div>,
    document.body,
  );
};

interface WorkspaceProps {
  tasks: Task[];
  teamFilter: TeamType | 'all';
  teamName: string;
  members: Member[];
  currentUserId: string;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onAddTask: (preset?: Partial<Task>) => void;
  searchQuery: string;
  onTaskClick: (task: Task) => void;
  onOpenAiChat: () => void;
  onUpdateTask: (task: Task) => void;
  teamStatuses: Record<string, string[]>;
  onUpdateTeamStatuses: (teamId: string, newStatuses: string[]) => void;
  archivedStatuses: Record<string, string[]>;
  statusCategories: Record<string, Record<string, string>>;
  onArchiveStatus: (teamId: string, status: string) => void;
  onDuplicateStatus: (teamId: string, status: string, withData: boolean) => void;
  onSetStatusCategory: (teamId: string, statusName: string, category: string) => void;
  customProperties?: CustomProperty[];
  onAddProperty?: (property: CustomProperty) => void;
  onUpdateProperty?: (property: CustomProperty) => void;
  onDeleteProperty?: (propertyId: string) => void;
  onReorderProperties?: (orderedIds: string[]) => void;
  userRole?: UserRole;
  onReorderTask?: (taskId: string, targetTaskId: string, position: 'before' | 'after') => void;
  allPlacements: string[];
  teamTypes?: Record<string, string[]>;
  taskTeamLinks?: TaskTeamLink[];
  allTeams?: { id: string; name: string }[];
  onLinkTaskToTeam?: (taskId: string, teamId: string) => void;
  onDeleteTask?: (taskId: string) => void;
}

type ViewMode = 'board' | 'table' | 'calendar';

const Workspace: React.FC<WorkspaceProps> = ({
  tasks,
  teamFilter,
  teamName,
  members,
  currentUserId,
  onUpdateTaskStatus,
  onAddTask,
  searchQuery,
  onTaskClick,
  onOpenAiChat,
  onUpdateTask,
  teamStatuses,
  onUpdateTeamStatuses,
  archivedStatuses,
  statusCategories,
  onArchiveStatus,
  onDuplicateStatus,
  onSetStatusCategory,
  customProperties = [],
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onReorderProperties,
  userRole,
  onReorderTask,
  allPlacements = [],
  teamTypes = {},
  taskTeamLinks = [],
  allTeams = [],
  onLinkTaskToTeam,
  onDeleteTask,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showArchivedStatuses, setShowArchivedStatuses] = useState(false);

  // Column sorting state (tasks within groups)
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Status group sorting state
  const [statusSort, setStatusSort] = useState<string | null>(null);
  const [statusSortDirection, setStatusSortDirection] = useState<'asc' | 'desc'>('asc');

  // Drag-over indicator state for within-group reorder
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'above' | 'below'>('below');

  // Property Creation State
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState<string | null>(null);
  const [isReorderColumnsOpen, setIsReorderColumnsOpen] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<CustomProperty['type']>('text');

  // Bulk selection state (table view)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkStatusMenuOpen, setBulkStatusMenuOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const lastClickedTaskRef = useRef<string | null>(null);

  // --- Data-driven table columns with persistent ordering ---
  const allTableColumns = useMemo(() => {
    const base: { key: string; label: string; className: string }[] = [
      { key: 'title', label: 'Title', className: 'w-[20%]' },
      { key: 'type', label: 'Type', className: 'w-28' },
      {
        key: 'assignee',
        label: teamName.toLowerCase().includes('management') ? 'Executive' : 'Author',
        className: 'w-32',
      },
      { key: 'editor', label: teamName.toLowerCase().includes('management') ? 'Manager' : 'Editor', className: 'w-32' },

      { key: 'priority', label: 'Priority', className: 'w-24' },
      { key: 'deadline', label: 'Deadline', className: 'w-24' },
      { key: 'done', label: 'Pub Date', className: 'w-24' },
    ];
    const propCols = customProperties.map((p) => ({
      key: `prop:${p.id}`,
      label: p.name,
      className: 'w-32',
    }));
    return [
      ...base,
      ...propCols,
      { key: 'links', label: 'Links', className: 'w-32' },
      { key: 'placements', label: 'Placements', className: 'w-32' },
    ];
  }, [teamFilter, customProperties]);

  const columnOrderKey = `table-col-order-${teamFilter}`;
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(columnOrderKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Re-load when teamFilter changes
  const [prevOrderKey, setPrevOrderKey] = useState(columnOrderKey);
  if (prevOrderKey !== columnOrderKey) {
    setPrevOrderKey(columnOrderKey);
    try {
      const saved = localStorage.getItem(columnOrderKey);
      setColumnOrder(saved ? JSON.parse(saved) : []);
    } catch {
      setColumnOrder([]);
    }
  }

  // Ordered columns: respect saved order, add any new columns at the end
  const orderedTableColumns = useMemo(() => {
    const allKeys = allTableColumns.map((c) => c.key);
    // Filter saved order to only valid keys
    const validOrder = columnOrder.filter((k) => allKeys.includes(k));
    // Add any keys not in saved order
    const missing = allKeys.filter((k) => !validOrder.includes(k));
    const finalOrder = [...validOrder, ...missing];
    return finalOrder.map((k) => allTableColumns.find((c) => c.key === k)!);
  }, [allTableColumns, columnOrder]);

  const reorderColumns = (newOrder: string[]) => {
    setColumnOrder(newOrder);
    localStorage.setItem(columnOrderKey, JSON.stringify(newOrder));
  };

  // Collapsible State — persisted per team in localStorage
  const collapsedKey = `collapsed-sections-${teamFilter}`;
  const [prevCollapsedKey, setPrevCollapsedKey] = useState(collapsedKey);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(collapsedKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Re-load when teamFilter changes
  if (prevCollapsedKey !== collapsedKey) {
    setPrevCollapsedKey(collapsedKey);
    try {
      const saved = localStorage.getItem(collapsedKey);
      setCollapsedSections(saved ? JSON.parse(saved) : {});
    } catch {
      setCollapsedSections({});
    }
  }

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(collapsedKey, JSON.stringify(next));
      return next;
    });
  };

  // IDs of all Person-type custom properties
  const personPropIds = useMemo(
    () => customProperties.filter((p) => p.type === 'person').map((p) => p.id),
    [customProperties],
  );

  // Check if a userId appears in any Person custom property of a task
  const taskHasPersonInCustomFields = useCallback(
    (task: Task, userId: string): boolean => {
      const vals = task.customFieldValues;
      if (!vals || personPropIds.length === 0) return false;
      return personPropIds.some((propId) => {
        const v = vals[propId];
        if (!v) return false;
        return Array.isArray(v) ? v.includes(userId) : v === userId;
      });
    },
    [personPropIds],
  );

  // Determine current column list
  const currentStatusList = useMemo(() => {
    if (teamFilter === 'my-work') {
      // Dynamic columns for My Work — exclude statuses marked as Done or Archive
      const myTasks = tasks.filter((t) => {
        const isInvolved =
          t.assigneeIds.includes(currentUserId) ||
          t.contentInfo?.editorIds?.includes(currentUserId) ||
          t.contentInfo?.designerIds?.includes(currentUserId) ||
          taskHasPersonInCustomFields(t, currentUserId);
        const cat = statusCategories[t.teamId]?.[t.status] || 'active';
        return isInvolved && cat === 'active';
      });
      const uniqueStatuses = Array.from(new Set(myTasks.map((t) => t.status)));

      // Apply saved order if available
      const savedOrder = teamStatuses['my-work'];
      if (savedOrder && savedOrder.length > 0) {
        const newStatuses = uniqueStatuses.filter((s) => !savedOrder.includes(s));
        return [...savedOrder, ...newStatuses];
      }
      return uniqueStatuses;
    }
    return teamStatuses[teamFilter] || teamStatuses['default'] || [];
  }, [teamStatuses, teamFilter, tasks, currentUserId, taskHasPersonInCustomFields, statusCategories]);

  const columns = useMemo(() => {
    // Filter out archived unless showArchivedStatuses is true
    const archived = archivedStatuses[teamFilter] || [];
    const visible = currentStatusList.filter((s) => (showArchivedStatuses ? true : !archived.includes(s)));
    return visible.map((s) => ({ id: s, label: s }));
  }, [currentStatusList, archivedStatuses, teamFilter, showArchivedStatuses]);

  // Inline Editing State
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [tempColumnName, setTempColumnName] = useState('');

  // Menu State for Columns
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const columnMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activePropertyMenu, setActivePropertyMenu] = useState<string | null>(null);

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Filters State
  const [filterPerson, setFilterPerson] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterPlacements, setFilterPlacements] = useState<string[]>([]);

  // Pre-build lookup of linked task IDs for the current team filter
  const linkedTaskIdsForTeam = useMemo(() => {
    if (teamFilter === 'my-work' || teamFilter === 'all') return new Set<string>();
    return new Set(taskTeamLinks.filter((l) => l.teamId === teamFilter).map((l) => l.taskId));
  }, [taskTeamLinks, teamFilter]);

  // Resolve a task's status within the current team context
  const getTaskStatusInTeam = useCallback(
    (task: Task): string => {
      if (teamFilter === 'my-work' || teamFilter === 'all' || task.teamId === teamFilter) return task.status;
      const link = taskTeamLinks.find((l) => l.taskId === task.id && l.teamId === teamFilter);
      return link ? link.status : task.status;
    },
    [teamFilter, taskTeamLinks],
  );

  // Resolve custom field values for the current team context
  const getTaskFieldsInTeam = useCallback(
    (task: Task): Record<string, any> => {
      if (teamFilter === 'my-work' || teamFilter === 'all' || task.teamId === teamFilter)
        return task.customFieldValues || {};
      const link = taskTeamLinks.find((l) => l.taskId === task.id && l.teamId === teamFilter);
      return link ? link.customFieldValues : task.customFieldValues || {};
    },
    [teamFilter, taskTeamLinks],
  );

  // Check if a task is a linked copy (not home) in the current team
  const isLinkedCopy = useCallback(
    (task: Task): boolean => {
      if (teamFilter === 'my-work' || teamFilter === 'all') return false;
      return task.teamId !== teamFilter && linkedTaskIdsForTeam.has(task.id);
    },
    [teamFilter, linkedTaskIdsForTeam],
  );

  // Filtering Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      let matchTeam = false;
      if (teamFilter === 'my-work') {
        // Check if user is involved
        const isInvolved =
          t.assigneeIds.includes(currentUserId) ||
          (t.contentInfo?.editorIds?.includes(currentUserId) ?? false) ||
          (t.contentInfo?.designerIds?.includes(currentUserId) ?? false) ||
          taskHasPersonInCustomFields(t, currentUserId);
        // Exclude tasks whose status is marked as Done or Archive in their home team
        const taskCategory = statusCategories[t.teamId]?.[t.status] || 'active';
        matchTeam = isInvolved && taskCategory === 'active';
      } else {
        matchTeam = teamFilter === 'all' || t.teamId === teamFilter || linkedTaskIdsForTeam.has(t.id);
      }

      // Apply Person filter only if NOT in 'my-work'
      const matchPerson =
        teamFilter === 'my-work' ||
        filterPerson === 'all' ||
        t.assigneeIds.includes(filterPerson) ||
        taskHasPersonInCustomFields(t, filterPerson);
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
      const matchPlacement =
        filterPlacements.length === 0 || t.placements.some((tag) => filterPlacements.includes(tag));

      const lowerQuery = searchQuery.toLowerCase();
      const matchSearch =
        !searchQuery ||
        t.title.toLowerCase().includes(lowerQuery) ||
        (t.description && t.description.toLowerCase().includes(lowerQuery));

      return matchTeam && matchPerson && matchPriority && matchPlacement && matchSearch;
    });
  }, [
    tasks,
    teamFilter,
    filterPerson,
    filterPriority,
    filterPlacements,
    searchQuery,
    currentUserId,
    linkedTaskIdsForTeam,
    taskHasPersonInCustomFields,
    statusCategories,
  ]);

  // Derived columns to display: If searching, only show columns with tasks; then apply status sort
  const displayColumns = useMemo(() => {
    const hasActiveFilter =
      searchQuery || filterPerson !== 'all' || filterPriority !== 'all' || filterPlacements.length > 0;
    let cols = hasActiveFilter
      ? columns.filter((col) => filteredTasks.some((t) => getTaskStatusInTeam(t) === col.id))
      : [...columns];

    if (statusSort) {
      const dir = statusSortDirection === 'asc' ? 1 : -1;
      cols = [...cols].sort((a, b) => {
        switch (statusSort) {
          case 'name':
            return dir * a.label.localeCompare(b.label);
          case 'count': {
            const countA = filteredTasks.filter((t) => getTaskStatusInTeam(t) === a.id).length;
            const countB = filteredTasks.filter((t) => getTaskStatusInTeam(t) === b.id).length;
            return dir * (countA - countB);
          }
          default:
            return 0;
        }
      });
    }

    return cols;
  }, [
    columns,
    filteredTasks,
    getTaskStatusInTeam,
    searchQuery,
    filterPerson,
    filterPriority,
    filterPlacements,
    statusSort,
    statusSortDirection,
  ]);

  const getMembersByIds = (ids: string[]) => members.filter((m) => ids.includes(m.id));

  // Team-grouped data for my-work view
  const myWorkTeamGroups = useMemo(() => {
    if (teamFilter !== 'my-work') return [];
    const grouped: Record<string, Task[]> = {};
    for (const t of filteredTasks) {
      if (!grouped[t.teamId]) grouped[t.teamId] = [];
      grouped[t.teamId].push(t);
    }
    return Object.entries(grouped)
      .map(([teamId, teamTasks]) => {
        const team = allTeams.find((t) => t.id === teamId);
        const uniqueStatuses = Array.from(new Set(teamTasks.map((t) => t.status)));
        return {
          teamId,
          teamName: team?.name || 'Unknown Team',
          statuses: uniqueStatuses.map((s) => ({ id: s, label: s })),
          tasks: teamTasks,
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [teamFilter, filteredTasks, allTeams]);

  // Column Management
  const updateParentStatuses = (newStatuses: string[]) => {
    const keyToUpdate = teamFilter === 'my-work' ? 'my-work' : teamStatuses[teamFilter] ? teamFilter : 'default';
    onUpdateTeamStatuses(keyToUpdate, newStatuses);
  };

  const handleAddColumn = () => {
    if (teamFilter === 'my-work') return;
    const name = 'New Status';
    let uniqueName = name;
    let counter = 1;
    while (currentStatusList.includes(uniqueName)) {
      uniqueName = `${name} ${counter++}`;
    }

    const newStatuses = [...currentStatusList, uniqueName];
    updateParentStatuses(newStatuses);

    setTimeout(() => {
      setEditingColumnId(uniqueName);
      setTempColumnName(uniqueName);
    }, 100);
  };

  const handleStartRename = (id: string, currentLabel: string) => {
    if (teamFilter === 'my-work' && !customProperties.find((p) => p.id === id)) return;
    setEditingColumnId(id);
    setTempColumnName(currentLabel);
    setActiveColumnMenu(null);
    setActivePropertyMenu(null);
  };

  const handleSaveRename = () => {
    if (editingColumnId && tempColumnName.trim()) {
      // Check if it's a status column
      if (currentStatusList.includes(editingColumnId)) {
        if (editingColumnId !== tempColumnName.trim()) {
          const newStatuses = currentStatusList.map((s) => (s === editingColumnId ? tempColumnName.trim() : s));
          updateParentStatuses(newStatuses);
        }
      } else {
        // It's a custom property
        const prop = customProperties.find((p) => p.id === editingColumnId);
        if (prop && onUpdateProperty) {
          onUpdateProperty({ ...prop, name: tempColumnName.trim() });
        }
      }
    }
    setEditingColumnId(null);
  };

  const handleDeleteColumn = (id: string) => {
    if (!userRole || !isAdminOrAbove(userRole)) {
      toast.error('Only admins can delete statuses.');
      return;
    }
    if (confirm(`Delete "${id}" status? Tasks in this column will be hidden.`)) {
      const newStatuses = currentStatusList.filter((s) => s !== id);
      updateParentStatuses(newStatuses);
    }
    setActiveColumnMenu(null);
  };

  const handleDeleteProperty = (id: string) => {
    if (confirm('Delete this property? Data will be lost.') && onDeleteProperty) {
      onDeleteProperty(id);
    }
    setActivePropertyMenu(null);
  };

  // Move a status group up or down
  const handleMoveStatus = (statusId: string, direction: 'up' | 'down') => {
    const idx = currentStatusList.indexOf(statusId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentStatusList.length) return;

    const newStatuses = [...currentStatusList];
    [newStatuses[idx], newStatuses[targetIdx]] = [newStatuses[targetIdx], newStatuses[idx]];
    updateParentStatuses(newStatuses);
  };

  // Status group sort handler
  const handleStatusSort = (mode: string) => {
    if (statusSort === mode) {
      if (statusSortDirection === 'asc') {
        setStatusSortDirection('desc');
      } else {
        setStatusSort(null);
        setStatusSortDirection('asc');
      }
    } else {
      setStatusSort(mode);
      setStatusSortDirection('asc');
    }
  };

  // Column sort handler
  const handleHeaderSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // Third click — clear sort
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort tasks within a group
  const sortTasks = (taskList: Task[]): Task[] => {
    if (!sortColumn) {
      // Default: sort by sortOrder
      return [...taskList].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }

    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...taskList].sort((a, b) => {
      switch (sortColumn) {
        case 'title':
          return dir * a.title.localeCompare(b.title);
        case 'priority': {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return dir * ((order[a.priority] ?? 1) - (order[b.priority] ?? 1));
        }
        case 'deadline':
          return dir * (a.dueDate || '').localeCompare(b.dueDate || '');
        case 'done':
          return dir * (a.doneDate || '').localeCompare(b.doneDate || '');
        case 'type':
          return dir * (a.contentInfo?.type || '').localeCompare(b.contentInfo?.type || '');
        case 'assignee': {
          const nameA = members.find((m) => a.assigneeIds[0] === m.id)?.name || '';
          const nameB = members.find((m) => b.assigneeIds[0] === m.id)?.name || '';
          return dir * nameA.localeCompare(nameB);
        }
        case 'editor': {
          const edA = members.find((m) => a.contentInfo?.editorIds?.[0] === m.id)?.name || '';
          const edB = members.find((m) => b.contentInfo?.editorIds?.[0] === m.id)?.name || '';
          return dir * edA.localeCompare(edB);
        }

        case 'links':
          return dir * ((a.links?.length || 0) - (b.links?.length || 0));
        case 'placements':
          return dir * (a.placements || []).join(', ').localeCompare((b.placements || []).join(', '));
        default: {
          // Custom properties — key format: "prop:<id>"
          if (sortColumn.startsWith('prop:')) {
            const propId = sortColumn.slice(5);
            const valA = String(getTaskFieldsInTeam(a)[propId] || '');
            const valB = String(getTaskFieldsInTeam(b)[propId] || '');
            return dir * valA.localeCompare(valB);
          }
          return 0;
        }
      }
    });
  };

  // --- Bulk selection helpers ---
  const selectedCount = selectedTaskIds.size;

  const toggleTaskSelection = (taskId: string, shiftKey: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedTaskRef.current) {
        // Range selection: find all visible tasks between last clicked and current
        const allVisibleIds = displayColumns.flatMap((col) =>
          sortTasks(filteredTasks.filter((t) => getTaskStatusInTeam(t) === col.id)).map((t) => t.id),
        );
        const lastIdx = allVisibleIds.indexOf(lastClickedTaskRef.current);
        const curIdx = allVisibleIds.indexOf(taskId);
        if (lastIdx !== -1 && curIdx !== -1) {
          const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = from; i <= to; i++) next.add(allVisibleIds[i]);
        } else {
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
        }
      } else {
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
      }
      return next;
    });
    lastClickedTaskRef.current = taskId;
  };

  const toggleGroupSelection = (statusId: string) => {
    const groupIds = filteredTasks.filter((t) => t.status === statusId).map((t) => t.id);
    setSelectedTaskIds((prev) => {
      const allSelected = groupIds.length > 0 && groupIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      return next;
    });
    lastClickedTaskRef.current = null;
  };

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
    setBulkStatusMenuOpen(false);
    lastClickedTaskRef.current = null;
  };

  const handleBulkMove = (targetStatus: string) => {
    const tasksToMove = filteredTasks.filter(
      (t) => selectedTaskIds.has(t.id) && getTaskStatusInTeam(t) !== targetStatus,
    );
    if (tasksToMove.length > 0) {
      tasksToMove.forEach((t) => onUpdateTaskStatus(t.id, targetStatus as TaskStatus));
      toast.success(`Moved ${tasksToMove.length} task${tasksToMove.length > 1 ? 's' : ''} to ${targetStatus}`);
      clearSelection();
    } else {
      setBulkStatusMenuOpen(false);
    }
  };

  // Clear selection on team/view/filter/search changes
  const clearKey = `${teamFilter}-${viewMode}-${searchQuery}`;
  const [prevClearKey, setPrevClearKey] = useState(clearKey);
  if (clearKey !== prevClearKey) {
    setPrevClearKey(clearKey);
    setSelectedTaskIds(new Set());
    setBulkStatusMenuOpen(false);
  }

  // Escape key clears selection
  useEffect(() => {
    if (selectedCount === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTaskIds(new Set());
        setBulkStatusMenuOpen(false);
        lastClickedTaskRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCount]);

  // HTML5 Drag and Drop Handlers for TASKS
  const handleDragStart = (e: React.DragEvent, taskId: string, sourceStatus: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.setData('sourceStatus', sourceStatus);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTaskDragOver = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragPosition(e.clientY < midY ? 'above' : 'below');
    setDragOverTaskId(targetTaskId);
  };

  const handleTaskDragLeave = () => {
    setDragOverTaskId(null);
  };

  const handleDropOnTask = (e: React.DragEvent, targetTaskId: string, targetStatus: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTaskId(null);
    const taskId = e.dataTransfer.getData('taskId');
    const sourceStatus = e.dataTransfer.getData('sourceStatus');

    if (!taskId) return;

    if (sourceStatus === targetStatus && taskId !== targetTaskId && onReorderTask && !sortColumn) {
      // Same status group — reorder
      onReorderTask(taskId, targetTaskId, dragPosition === 'above' ? 'before' : 'after');
    } else if (sourceStatus !== targetStatus) {
      // Different status — change status
      onUpdateTaskStatus(taskId, targetStatus);
    }
  };

  const handleDropStatus = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTaskId(null);
    const taskId = e.dataTransfer.getData('taskId');

    if (taskId) {
      onUpdateTaskStatus(taskId, newStatus);
    }
  };

  const handleDropDate = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        onUpdateTask({ ...task, dueDate: dateStr });
      }
    }
  };

  const handleCreateProperty = () => {
    if (!newPropName || !onAddProperty) return;
    const newProp: CustomProperty = {
      id: crypto.randomUUID(),
      name: newPropName,
      type: newPropType,
      options: [], // Default empty options for select types
    };
    onAddProperty(newProp);
    setNewPropName('');
    setIsAddPropertyOpen(null);
  };

  // Calendar Helpers
  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1);
    const days = [];
    const firstDayIndex = date.getDay(); // 0 for Sunday
    const prevLastDay = new Date(year, month, 0).getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (let i = firstDayIndex; i > 0; i--) {
      days.push({ day: prevLastDay - i + 1, type: 'prev', date: new Date(year, month - 1, prevLastDay - i + 1) });
    }

    for (let i = 1; i <= lastDay; i++) {
      days.push({ day: i, type: 'current', date: new Date(year, month, i) });
    }
    const totalCells = days.length;
    const remainder = totalCells % 7;
    if (remainder !== 0) {
      const padding = 7 - remainder;
      for (let i = 1; i <= padding; i++) {
        days.push({ day: i, type: 'next', date: new Date(year, month + 1, i) });
      }
    }

    return days;
  };

  const calendarDays = getDaysInMonth(calendarDate.getFullYear(), calendarDate.getMonth());
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const changeMonth = (offset: number) => {
    const newDate = new Date(calendarDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCalendarDate(newDate);
  };

  // Click outside to close menus
  useEffect(() => {
    const closeMenu = () => {
      setActiveColumnMenu(null);
      setActivePropertyMenu(null);
      setIsAddPropertyOpen(null);
      setIsReorderPropsOpen(null);
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-white dark:bg-black">
      {/* Header */}
      <div className="flex flex-col gap-6 mb-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{teamName}</h2>
            <Divider orientation="vertical" className="h-6" />
            {/* View Switcher */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-xs font-medium focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${viewMode === 'table' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <List size={14} /> Table
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-xs font-medium focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${viewMode === 'board' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <LayoutGrid size={14} /> Board
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-xs font-medium focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${viewMode === 'calendar' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <CalendarIcon size={14} /> Calendar
              </button>
            </div>
          </div>

          {/* Actions: AI & New Task */}
          {teamFilter !== 'my-work' && (
            <div className="flex gap-2 items-center">
              <Button size="sm" onClick={() => onAddTask()} className="flex items-center gap-1.5">
                <Plus size={14} />
                New
              </Button>
            </div>
          )}
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3 items-center">
          {/* Person Filter - Hidden for My Work */}
          {teamFilter !== 'my-work' && (
            <div className="w-[140px]">
              <CustomSelect
                icon={User}
                options={[{ value: 'all', label: 'Person' }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                value={filterPerson}
                onChange={setFilterPerson}
                placeholder="Person"
              />
            </div>
          )}

          <div className="w-[140px]">
            <CustomSelect
              icon={Filter}
              options={[
                { value: 'all', label: 'Priority' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
              value={filterPriority}
              onChange={setFilterPriority}
              placeholder="Priority"
            />
          </div>

          <div className="min-w-[200px]">
            <MultiSelect
              icon={MapPin}
              label=""
              options={allPlacements.map((p) => ({ value: p, label: p }))}
              selected={filterPlacements}
              onChange={(selected) => setFilterPlacements(selected)}
              placeholder="Filter placements..."
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden h-full flex flex-col relative">
        {displayColumns.length === 0 && searchQuery && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
            <p>No tasks found for "{searchQuery}"</p>
          </div>
        )}

        {viewMode === 'board' && filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="text-zinc-300 dark:text-zinc-600 mb-3">
              <CheckCircle size={40} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No tasks yet</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Tasks assigned to you will appear here</p>
          </div>
        )}
        {viewMode === 'board' &&
          filteredTasks.length > 0 &&
          displayColumns.length > 0 &&
          (teamFilter === 'my-work' ? (
            <div className="flex flex-col gap-6 overflow-auto pb-4 h-full">
              {myWorkTeamGroups.map((group) => {
                const isTeamCollapsed = collapsedSections[`team::${group.teamId}`];
                return (
                  <div key={group.teamId}>
                    <div
                      className="flex items-center gap-2 py-2 px-1 cursor-pointer select-none border-b border-zinc-200 dark:border-zinc-800 mb-3"
                      onClick={() => toggleSection(`team::${group.teamId}`)}
                    >
                      <ChevronRight
                        size={16}
                        className={`text-zinc-400 transition-transform ${isTeamCollapsed ? '' : 'rotate-90'}`}
                      />
                      <span className="text-base font-bold text-zinc-900 dark:text-white">{group.teamName}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                        {group.tasks.length}
                      </span>
                    </div>
                    {!isTeamCollapsed && (
                      <div className="flex gap-6 overflow-x-auto pb-4">
                        {group.statuses.map((status) => {
                          const col = status;
                          const statusCollapseKey = `${col.id}::${group.teamId}`;
                          const isCollapsed = collapsedSections[statusCollapseKey];
                          const isArchived = archivedStatuses[group.teamId]?.includes(col.id);
                          const statusCategory = statusCategories[group.teamId]?.[col.id] || 'active';
                          const isDoneStatus = statusCategory === 'completed';
                          const isIgnoredStatus = statusCategory === 'ignored';
                          const colTasks = group.tasks.filter((t) => t.status === col.id);
                          return (
                            <div
                              key={statusCollapseKey}
                              className={`flex flex-col h-full transition-all ${isCollapsed ? 'w-12' : 'min-w-[300px] max-w-[300px]'}`}
                            >
                              <div className="flex items-center justify-between px-1 mb-3 pb-2 group/header">
                                {isCollapsed ? (
                                  <div
                                    className="flex flex-col items-center gap-4 h-full py-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                                    onClick={() => toggleSection(statusCollapseKey)}
                                  >
                                    <span
                                      className={`text-[10px] font-semibold px-1.5 rounded ${isDoneStatus ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
                                    >
                                      {colTasks.length}
                                    </span>
                                    <div
                                      className={`writing-mode-vertical text-xs font-semibold tracking-wider whitespace-nowrap rotate-180 ${isDoneStatus ? 'text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500'}`}
                                      style={{ writingMode: 'vertical-rl' }}
                                    >
                                      {col.label}
                                    </div>
                                    <ChevronDown size={14} className="text-zinc-400" />
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : isDoneStatus ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
                                        >
                                          {colTasks.length}
                                        </span>
                                        <span
                                          className={`font-semibold text-xs flex items-center gap-1 ${isArchived ? 'text-amber-600 dark:text-amber-400' : isDoneStatus ? 'text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'}`}
                                        >
                                          {isArchived && <Archive size={12} />}
                                          {isDoneStatus && <CheckCircle size={12} />}
                                          {col.label}
                                        </span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSection(statusCollapseKey);
                                          }}
                                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                        >
                                          {collapsedSections[statusCollapseKey] ? (
                                            <EyeOff size={14} />
                                          ) : (
                                            <Eye size={14} />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                              {!isCollapsed && (
                                <div
                                  className={`flex-1 flex flex-col min-h-0 rounded-lg p-1 ${isArchived ? 'bg-amber-50/30 dark:bg-amber-950/10 border border-dashed border-amber-300 dark:border-amber-800' : 'bg-zinc-50/50 dark:bg-zinc-900/30'}`}
                                >
                                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {sortTasks(colTasks).map((task) => {
                                      const assignees = getMembersByIds(task.assigneeIds);
                                      return (
                                        <div
                                          key={task.id}
                                          onClick={() => onTaskClick(task)}
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, task.id, col.id)}
                                          className="bg-white dark:bg-zinc-900 p-3 rounded shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group cursor-grab active:cursor-grabbing relative"
                                        >
                                          <div className="flex justify-between items-start mb-2">
                                            <div className="flex gap-1 flex-wrap">
                                              {task.contentInfo?.type && (
                                                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">
                                                  {task.contentInfo.type}
                                                </span>
                                              )}
                                              <span
                                                className={`inline-flex items-center gap-1 text-[10px] font-medium capitalize px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority] || ''}`}
                                              >
                                                <span
                                                  className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority] || 'bg-zinc-400'}`}
                                                ></span>
                                                {task.priority}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap gap-1 mb-2">
                                            {task.placements.slice(0, 2).map((placement) => (
                                              <span
                                                key={placement}
                                                className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded"
                                              >
                                                {placement}
                                              </span>
                                            ))}
                                            {task.placements.length > 2 && (
                                              <span className="text-[10px] font-medium text-zinc-400 px-1">
                                                +{task.placements.length - 2}
                                              </span>
                                            )}
                                          </div>
                                          <p className="font-medium text-sm text-zinc-900 dark:text-white leading-snug mb-2">
                                            {task.title}
                                          </p>
                                          {assignees.length > 0 && (
                                            <div className="flex items-center gap-1 mt-1">
                                              {assignees.slice(0, 3).map((a) => (
                                                <Avatar key={a.id} src={a.avatar} alt={a.name} size="sm" />
                                              ))}
                                              {assignees.length > 3 && (
                                                <span className="text-[10px] text-zinc-400">
                                                  +{assignees.length - 3}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-6 overflow-x-auto pb-4 h-full">
              {displayColumns.map((col) => {
                const isCollapsed = collapsedSections[col.id];
                const isArchived = archivedStatuses[teamFilter]?.includes(col.id);
                const statusCategory = statusCategories[teamFilter]?.[col.id] || 'active';
                const isDoneStatus = statusCategory === 'completed';
                const isIgnoredStatus = statusCategory === 'ignored';
                return (
                  <div
                    key={col.id}
                    onDrop={(e) => handleDropStatus(e, col.id)}
                    onDragOver={handleDragOver}
                    className={`flex flex-col h-full transition-all ${isCollapsed ? 'w-12' : 'min-w-[300px] max-w-[300px]'}`}
                  >
                    <div className="flex items-center justify-between px-1 mb-3 pb-2 group/header">
                      {isCollapsed ? (
                        <div
                          className="flex flex-col items-center gap-4 h-full py-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                          onClick={() => toggleSection(col.id)}
                        >
                          <span
                            className={`text-[10px] font-semibold px-1.5 rounded ${isDoneStatus ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
                          >
                            {filteredTasks.filter((t) => getTaskStatusInTeam(t) === col.id).length}
                          </span>
                          <div
                            className={`writing-mode-vertical text-xs font-semibold tracking-wider whitespace-nowrap rotate-180 ${isDoneStatus ? 'text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500'}`}
                            style={{ writingMode: 'vertical-rl' }}
                          >
                            {col.label}
                          </div>
                          <ChevronDown size={14} className="text-zinc-400" />
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            {editingColumnId === col.id ? (
                              <input
                                autoFocus
                                className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-xs font-semibold w-full outline-none"
                                value={tempColumnName}
                                onChange={(e) => setTempColumnName(e.target.value)}
                                onBlur={handleSaveRename}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                {teamFilter !== 'my-work' && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveStatus(col.id, 'up');
                                      }}
                                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                      title="Move left"
                                    >
                                      <ChevronLeft size={14} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveStatus(col.id, 'down');
                                      }}
                                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                      title="Move right"
                                    >
                                      <ChevronRight size={14} />
                                    </button>
                                  </>
                                )}
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : isDoneStatus ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
                                >
                                  {filteredTasks.filter((t) => getTaskStatusInTeam(t) === col.id).length}
                                </span>
                                <span
                                  onClick={() => handleStartRename(col.id, col.label)}
                                  className={`font-semibold text-xs flex items-center gap-1 ${isArchived ? 'text-amber-600 dark:text-amber-400' : isDoneStatus ? 'text-emerald-600 dark:text-emerald-400' : isIgnoredStatus ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'} ${teamFilter !== 'my-work' ? 'hover:underline decoration-zinc-400 decoration-dashed underline-offset-4' : ''}`}
                                >
                                  {isArchived && <Archive size={12} />}
                                  {col.label}
                                </span>
                                {(teamFilter === 'my-work' || teamFilter === 'all') &&
                                  (() => {
                                    const sectionTasks = filteredTasks.filter((t) => getTaskStatusInTeam(t) === col.id);
                                    const teamIds = [...new Set(sectionTasks.map((t) => t.teamId))];
                                    const teamNames = teamIds
                                      .map((id) => allTeams.find((t) => t.id === id)?.name)
                                      .filter(Boolean);
                                    return teamNames.length > 0 ? (
                                      <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                                        {teamNames.join(', ')}
                                      </span>
                                    ) : null;
                                  })()}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSection(col.id);
                                  }}
                                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                >
                                  {collapsedSections[col.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                            )}
                          </div>

                          {teamFilter !== 'my-work' && (
                            <div className="relative">
                              <div className="opacity-0 group-hover/header:opacity-100 flex items-center transition-opacity">
                                <button
                                  ref={(el) => {
                                    columnMenuTriggerRefs.current[`board-${col.id}`] = el;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveColumnMenu(activeColumnMenu === col.id ? null : col.id);
                                  }}
                                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-1"
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                                {teamFilter !== 'my-work' && (
                                  <button
                                    onClick={() => onAddTask({ status: col.id })}
                                    className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors p-1"
                                  >
                                    <Plus size={14} />
                                  </button>
                                )}
                              </div>

                              <ColumnMenu
                                isOpen={activeColumnMenu === col.id}
                                onClose={() => setActiveColumnMenu(null)}
                                triggerKey={`board-${col.id}`}
                                triggerRefs={columnMenuTriggerRefs}
                                onRename={() => handleStartRename(col.id, col.label)}
                                onDuplicateEmpty={() => {
                                  onDuplicateStatus(teamFilter, col.id, false);
                                  setActiveColumnMenu(null);
                                }}
                                onDuplicateWithData={() => {
                                  onDuplicateStatus(teamFilter, col.id, true);
                                  setActiveColumnMenu(null);
                                }}
                                onToggleDone={() => {
                                  const current = statusCategories[teamFilter]?.[col.id] || 'active';
                                  onSetStatusCategory(
                                    teamFilter,
                                    col.id,
                                    current === 'completed' ? 'active' : 'completed',
                                  );
                                  setActiveColumnMenu(null);
                                }}
                                onArchive={() => {
                                  onArchiveStatus(teamFilter, col.id);
                                  setActiveColumnMenu(null);
                                }}
                                onDelete={() => handleDeleteColumn(col.id)}
                                isArchived={!!isArchived}
                                isDone={statusCategories[teamFilter]?.[col.id] === 'completed'}
                                isArchiveCategory={statusCategories[teamFilter]?.[col.id] === 'ignored'}
                                onToggleArchiveCategory={() => {
                                  const current = statusCategories[teamFilter]?.[col.id] || 'active';
                                  onSetStatusCategory(teamFilter, col.id, current === 'ignored' ? 'active' : 'ignored');
                                  setActiveColumnMenu(null);
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div
                        className={`flex-1 flex flex-col min-h-0 rounded-lg p-1 ${isArchived ? 'bg-amber-50/30 dark:bg-amber-950/10 border border-dashed border-amber-300 dark:border-amber-800' : 'bg-zinc-50/50 dark:bg-zinc-900/30'}`}
                      >
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {sortTasks(filteredTasks.filter((t) => getTaskStatusInTeam(t) === col.id)).map((task) => {
                            const assignees = getMembersByIds(task.assigneeIds);
                            return (
                              <div
                                key={task.id}
                                onClick={() => onTaskClick(task)}
                                draggable
                                onDragStart={(e) => handleDragStart(e, task.id, col.id)}
                                className="bg-white dark:bg-zinc-900 p-3 rounded shadow-sm border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group cursor-grab active:cursor-grabbing relative"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex gap-1 flex-wrap">
                                    {task.contentInfo?.type && (
                                      <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">
                                        {task.contentInfo.type}
                                      </span>
                                    )}
                                    <span
                                      className={`inline-flex items-center gap-1 text-[10px] font-medium capitalize px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority] || ''}`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority] || 'bg-zinc-400'}`}
                                      />
                                      {task.priority}
                                    </span>
                                  </div>
                                  <div className="text-zinc-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                                    <GripVertical size={14} />
                                  </div>
                                </div>
                                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2 leading-snug break-words overflow-hidden flex items-center gap-1.5">
                                  {isLinkedCopy(task) && <Link2 size={12} className="text-blue-500 flex-shrink-0" />}
                                  <span>{task.title}</span>
                                </h3>

                                <div className="flex flex-wrap gap-1 mb-3">
                                  {task.placements.slice(0, 2).map((placement) => (
                                    <span
                                      key={placement}
                                      className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded"
                                    >
                                      {placement}
                                    </span>
                                  ))}
                                  {task.placements.length > 2 && (
                                    <span className="text-[10px] font-medium text-zinc-400 px-1">
                                      +{task.placements.length - 2}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                  {(() => {
                                    const urgency = getDeadlineUrgency(task.dueDate);
                                    return (
                                      <div className={`flex items-center gap-1.5 text-[10px] ${urgency.text}`}>
                                        {urgency.dot ? (
                                          <span className={`w-1.5 h-1.5 rounded-full ${urgency.dot}`} />
                                        ) : (
                                          <CalendarIcon size={12} />
                                        )}
                                        <span>
                                          {new Date(task.dueDate).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                          })}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  <div className="flex -space-x-1.5">
                                    {assignees.length > 0 ? (
                                      assignees
                                        .slice(0, 3)
                                        .map((a) => (
                                          <Avatar
                                            key={a.id}
                                            src={a.avatar}
                                            alt={a.name}
                                            size="sm"
                                            className="!w-5 !h-5 !border-white dark:!border-zinc-900"
                                          />
                                        ))
                                    ) : (
                                      <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                                        <User size={10} />
                                      </div>
                                    )}
                                    {assignees.length > 3 && (
                                      <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-[10px] border border-white dark:border-zinc-900">
                                        +{assignees.length - 3}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Only show "Add Status" if not searching and not My Work */}
              {!searchQuery && teamFilter !== 'my-work' && (
                <div className="min-w-[300px]">
                  <button
                    onClick={handleAddColumn}
                    className="w-full h-12 flex items-center justify-center gap-2 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <Plus size={16} /> Add Status
                  </button>
                </div>
              )}
            </div>
          ))}

        {viewMode === 'table' && (
          <div className="h-full overflow-auto custom-scrollbar space-y-8 pr-2 pb-10">
            {filteredTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-zinc-300 dark:text-zinc-600 mb-3">
                  <CheckCircle size={40} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No tasks yet</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Tasks assigned to you will appear here</p>
              </div>
            )}
            {/* Team-grouped rendering for my-work */}
            {teamFilter === 'my-work' &&
              myWorkTeamGroups.map((group) => {
                const isTeamCollapsed = collapsedSections[`team::${group.teamId}`];
                return (
                  <div key={group.teamId} className="space-y-6">
                    <div
                      className="flex items-center gap-2 sticky top-0 bg-white dark:bg-black z-20 py-2 cursor-pointer select-none border-b border-zinc-200 dark:border-zinc-800"
                      onClick={() => toggleSection(`team::${group.teamId}`)}
                    >
                      <ChevronRight
                        size={16}
                        className={`text-zinc-400 transition-transform ${isTeamCollapsed ? '' : 'rotate-90'}`}
                      />
                      <span className="text-base font-bold text-zinc-900 dark:text-white">{group.teamName}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                        {group.tasks.length}
                      </span>
                    </div>
                    {!isTeamCollapsed &&
                      group.statuses.map((status) => {
                        const col = status;
                        const colTasks = group.tasks.filter((t) => t.status === col.id);
                        const statusCollapseKey = `${col.id}::${group.teamId}`;
                        const isCollapsed = collapsedSections[statusCollapseKey];
                        const isArchived = archivedStatuses[group.teamId]?.includes(col.id);
                        const isDoneTable = statusCategories[group.teamId]?.[col.id] === 'completed';
                        const isIgnoredTable = statusCategories[group.teamId]?.[col.id] === 'ignored';

                        return (
                          <div
                            key={statusCollapseKey}
                            className={`space-y-2 group/section relative ml-4 ${isArchived || isIgnoredTable ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-center gap-2 sticky top-8 bg-white dark:bg-black z-10 py-1.5 group/header">
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-medium ${isArchived || isIgnoredTable ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : isDoneTable ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}
                              >
                                {colTasks.length}
                              </span>
                              <h3
                                className={`text-sm font-semibold flex items-center gap-1.5 ${isArchived || isIgnoredTable ? 'text-amber-600 dark:text-amber-400' : isDoneTable ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}
                              >
                                {(isArchived || isIgnoredTable) && <Archive size={14} />}
                                {isDoneTable && <CheckCircle size={14} />}
                                {col.label}
                              </h3>
                              <button
                                onClick={() => toggleSection(statusCollapseKey)}
                                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-all"
                              >
                                {isCollapsed ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>

                            {!isCollapsed && (
                              <>
                                <div
                                  className={`border rounded-lg cursor-default overflow-clip ${isArchived || isIgnoredTable ? 'border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10' : isDoneTable ? 'border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-zinc-200 dark:border-zinc-800'}`}
                                >
                                  <table className="w-full text-left text-sm border-collapse min-w-[1100px] table-fixed">
                                    <thead
                                      className={`border-b ${isArchived || isIgnoredTable ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40' : isDoneTable ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}
                                    >
                                      <tr>
                                        <th className="p-3 w-10">
                                          <input
                                            type="checkbox"
                                            ref={(el) => {
                                              if (el) {
                                                const someSelected = colTasks.some((t) => selectedTaskIds.has(t.id));
                                                const allSelected =
                                                  colTasks.length > 0 &&
                                                  colTasks.every((t) => selectedTaskIds.has(t.id));
                                                el.indeterminate = someSelected && !allSelected;
                                              }
                                            }}
                                            checked={
                                              colTasks.length > 0 && colTasks.every((t) => selectedTaskIds.has(t.id))
                                            }
                                            onChange={() => toggleGroupSelection(col.id)}
                                            className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </th>
                                        {orderedTableColumns.map((tc) => (
                                          <th
                                            key={tc.key}
                                            className={`p-3 font-medium text-xs ${tc.className} cursor-pointer select-none transition-colors ${isArchived || isIgnoredTable ? 'text-amber-500 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-300' : isDoneTable ? 'text-emerald-500 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                                            onClick={() => handleHeaderSort(tc.key)}
                                          >
                                            <div className="flex items-center gap-1">
                                              <span>{tc.label}</span>
                                            </div>
                                          </th>
                                        ))}
                                        <th className="p-3 w-10"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                      {colTasks.length > 0 ? (
                                        sortTasks(colTasks).map((task) => {
                                          const assignees = getMembersByIds(task.assigneeIds);
                                          return (
                                            <tr
                                              key={task.id}
                                              className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${selectedTaskIds.has(task.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                              onClick={() => onTaskClick(task)}
                                              draggable
                                              onDragStart={(e) => handleDragStart(e, task.id, col.id)}
                                              onDragOver={(e) => handleTaskDragOver(e, task.id)}
                                              onDrop={(e) => handleDropOnTask(e, task.id, col.id)}
                                            >
                                              <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                  type="checkbox"
                                                  checked={selectedTaskIds.has(task.id)}
                                                  onChange={(e) =>
                                                    toggleTaskSelection(
                                                      task.id,
                                                      e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey,
                                                    )
                                                  }
                                                  className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                              </td>
                                              {orderedTableColumns.map((tc) => {
                                                switch (tc.key) {
                                                  case 'title':
                                                    return (
                                                      <td key={tc.key} className="p-3">
                                                        <span className="font-medium text-zinc-900 dark:text-white">
                                                          {task.title}
                                                        </span>
                                                      </td>
                                                    );
                                                  case 'type':
                                                    return (
                                                      <td key={tc.key} className="p-3">
                                                        {task.contentInfo?.type ? (
                                                          <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">
                                                            {task.contentInfo.type}
                                                          </span>
                                                        ) : (
                                                          <span className="text-zinc-300 dark:text-zinc-600 text-sm">
                                                            —
                                                          </span>
                                                        )}
                                                      </td>
                                                    );
                                                  case 'assignee':
                                                  case 'editor': {
                                                    const personKey = tc.key;
                                                    const selectedIds =
                                                      personKey === 'assignee'
                                                        ? task.assigneeIds
                                                        : task.contentInfo?.editorIds || [];
                                                    const people = getMembersByIds(selectedIds);
                                                    return (
                                                      <td key={tc.key} className="p-3">
                                                        {people.length > 0 ? (
                                                          <div className="flex flex-col gap-1">
                                                            {people.map((p) => (
                                                              <div key={p.id} className="flex items-center gap-1.5">
                                                                <Avatar
                                                                  src={p.avatar}
                                                                  alt={p.name}
                                                                  size="sm"
                                                                  className="flex-shrink-0"
                                                                />
                                                                <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                                                  {p.name}
                                                                </span>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        ) : (
                                                          <span className="text-zinc-300 dark:text-zinc-600 text-sm">
                                                            —
                                                          </span>
                                                        )}
                                                      </td>
                                                    );
                                                  }
                                                  case 'priority':
                                                    return (
                                                      <td key={tc.key} className="p-3">
                                                        <span
                                                          className={`inline-flex items-center gap-1 text-xs capitalize ${PRIORITY_COLORS[task.priority] || ''}`}
                                                        >
                                                          <span
                                                            className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority] || 'bg-zinc-400'}`}
                                                          ></span>
                                                          {task.priority}
                                                        </span>
                                                      </td>
                                                    );
                                                  case 'deadline': {
                                                    const urgency = getDeadlineUrgency(task.dueDate);
                                                    return (
                                                      <td
                                                        key={tc.key}
                                                        className="p-3 text-xs text-zinc-600 dark:text-zinc-400"
                                                      >
                                                        {task.dueDate ? (
                                                          <span className={urgency.text}>
                                                            {urgency.dot && (
                                                              <span
                                                                className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${urgency.dot}`}
                                                              ></span>
                                                            )}
                                                            {new Date(task.dueDate).toLocaleDateString()}
                                                          </span>
                                                        ) : (
                                                          '—'
                                                        )}
                                                      </td>
                                                    );
                                                  }
                                                  case 'links':
                                                    return (
                                                      <td key={tc.key} className="p-3">
                                                        {task.links && task.links.length > 0 ? (
                                                          <div className="flex items-center gap-1">
                                                            {task.links.slice(0, 3).map((link, i) => {
                                                              let hostname = '';
                                                              try {
                                                                hostname = new URL(link.url).hostname;
                                                              } catch {
                                                                /* ignore */
                                                              }
                                                              return (
                                                                <a
                                                                  key={i}
                                                                  href={link.url}
                                                                  target="_blank"
                                                                  rel="noopener noreferrer"
                                                                  onClick={(e) => e.stopPropagation()}
                                                                  title={link.title || link.url}
                                                                  className="flex-shrink-0 w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                                                                >
                                                                  <img
                                                                    src={
                                                                      hostname
                                                                        ? getFaviconUrl(link.url, hostname)
                                                                        : undefined
                                                                    }
                                                                    alt=""
                                                                    className="w-3.5 h-3.5"
                                                                    onError={(e) => {
                                                                      const img = e.target as HTMLImageElement;
                                                                      img.style.display = 'none';
                                                                      img.parentElement!.innerHTML =
                                                                        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
                                                                    }}
                                                                  />
                                                                </a>
                                                              );
                                                            })}
                                                            {task.links.length > 3 && (
                                                              <span className="text-[11px] text-zinc-400 flex-shrink-0">
                                                                +{task.links.length - 3}
                                                              </span>
                                                            )}
                                                          </div>
                                                        ) : (
                                                          <span className="text-zinc-300 dark:text-zinc-600 text-sm">
                                                            —
                                                          </span>
                                                        )}
                                                      </td>
                                                    );
                                                  case 'placements':
                                                    return (
                                                      <td key={tc.key} className="p-3">
                                                        {task.placements.length > 0 ? (
                                                          <div className="flex flex-col gap-1">
                                                            {task.placements.slice(0, 2).map((p, i) => (
                                                              <span
                                                                key={`${p}-${i}`}
                                                                className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded w-fit"
                                                              >
                                                                {p}
                                                              </span>
                                                            ))}
                                                            {task.placements.length > 2 && (
                                                              <span className="text-[11px] text-zinc-400">
                                                                +{task.placements.length - 2}
                                                              </span>
                                                            )}
                                                          </div>
                                                        ) : (
                                                          <span className="text-zinc-300 dark:text-zinc-600 text-sm">
                                                            —
                                                          </span>
                                                        )}
                                                      </td>
                                                    );
                                                  default: {
                                                    if (tc.key.startsWith('prop:')) {
                                                      const propId = tc.key.slice(5);
                                                      const prop = customProperties.find((p) => p.id === propId);
                                                      const fieldValues = getTaskFieldsInTeam(task);
                                                      const val = fieldValues[propId];
                                                      if (prop?.type === 'person' && val) {
                                                        const personIds = Array.isArray(val) ? val : [val];
                                                        const people = members.filter((m) => personIds.includes(m.id));
                                                        return (
                                                          <td key={tc.key} className="p-3">
                                                            {people.length > 0 ? (
                                                              <div className="flex flex-col gap-1">
                                                                {people.map((p) => (
                                                                  <div key={p.id} className="flex items-center gap-1.5">
                                                                    <Avatar
                                                                      src={p.avatar}
                                                                      alt={p.name}
                                                                      size="sm"
                                                                      className="flex-shrink-0"
                                                                    />
                                                                    <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                                                      {p.name}
                                                                    </span>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            ) : (
                                                              <span className="text-xs text-zinc-400">-</span>
                                                            )}
                                                          </td>
                                                        );
                                                      }
                                                      if (prop?.type === 'tags') {
                                                        const tagVals: string[] = Array.isArray(val)
                                                          ? val
                                                          : val
                                                            ? [val]
                                                            : [];
                                                        return (
                                                          <td
                                                            key={tc.key}
                                                            className="p-3"
                                                            onClick={(e) => e.stopPropagation()}
                                                          >
                                                            <TagSelect
                                                              tags={prop.options || []}
                                                              selected={tagVals}
                                                              tagColors={prop.optionColors || {}}
                                                              onChange={(tags) =>
                                                                onUpdateTask({
                                                                  ...task,
                                                                  customFieldValues: {
                                                                    ...task.customFieldValues,
                                                                    [propId]: tags,
                                                                  },
                                                                })
                                                              }
                                                              onAddTag={(name, color) => {
                                                                if (onUpdateProperty)
                                                                  onUpdateProperty({
                                                                    ...prop,
                                                                    options: [...(prop.options || []), name],
                                                                    optionColors: {
                                                                      ...(prop.optionColors || {}),
                                                                      [name]: color,
                                                                    },
                                                                  });
                                                              }}
                                                              onUpdateTagColor={(name, color) => {
                                                                if (onUpdateProperty)
                                                                  onUpdateProperty({
                                                                    ...prop,
                                                                    optionColors: {
                                                                      ...(prop.optionColors || {}),
                                                                      [name]: color,
                                                                    },
                                                                  });
                                                              }}
                                                              onDeleteTag={(name) => {
                                                                if (onUpdateProperty) {
                                                                  const newColors = { ...(prop.optionColors || {}) };
                                                                  delete newColors[name];
                                                                  onUpdateProperty({
                                                                    ...prop,
                                                                    options: (prop.options || []).filter(
                                                                      (o) => o !== name,
                                                                    ),
                                                                    optionColors: newColors,
                                                                  });
                                                                  if (Array.isArray(val) && val.includes(name))
                                                                    onUpdateTask({
                                                                      ...task,
                                                                      customFieldValues: {
                                                                        ...task.customFieldValues,
                                                                        [propId]: val.filter((t: string) => t !== name),
                                                                      },
                                                                    });
                                                                }
                                                              }}
                                                              compact
                                                              maxVisible={3}
                                                            />
                                                          </td>
                                                        );
                                                      }
                                                      return (
                                                        <td
                                                          key={tc.key}
                                                          className="p-3 text-xs text-zinc-600 dark:text-zinc-400 truncate"
                                                        >
                                                          {val ? String(val) : '-'}
                                                        </td>
                                                      );
                                                    }
                                                    return <td key={tc.key} className="p-3" />;
                                                  }
                                                }
                                              })}
                                              <td className="p-3"></td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr>
                                          <td
                                            colSpan={orderedTableColumns.length + 2}
                                            className="p-4 text-center text-xs text-zinc-400 italic"
                                          >
                                            No tasks in this step
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}

            {/* Regular (non-my-work) table rendering */}
            {teamFilter !== 'my-work' &&
              displayColumns.map((col) => {
                const colTasks = filteredTasks.filter((t) => getTaskStatusInTeam(t) === col.id);
                const isCollapsed = collapsedSections[col.id];
                const isArchived = archivedStatuses[teamFilter]?.includes(col.id);

                const isDoneTable = statusCategories[teamFilter]?.[col.id] === 'completed';
                const isIgnoredTable = statusCategories[teamFilter]?.[col.id] === 'ignored';

                return (
                  <div
                    key={col.id}
                    className={`space-y-2 group/section relative ${isArchived || isIgnoredTable ? 'opacity-60' : ''}`}
                    onDrop={(e) => handleDropStatus(e, col.id)}
                    onDragOver={handleDragOver}
                  >
                    <div className="flex items-center gap-2 sticky top-0 bg-white dark:bg-black z-10 py-2 group/header">
                      {!statusSort && teamFilter !== 'my-work' && (
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleMoveStatus(col.id, 'up')}
                            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-0 leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                            disabled={currentStatusList.indexOf(col.id) === 0}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => handleMoveStatus(col.id, 'down')}
                            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-0 leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                            disabled={currentStatusList.indexOf(col.id) === currentStatusList.length - 1}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${isArchived || isIgnoredTable ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : isDoneTable ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}
                      >
                        {colTasks.length}
                      </span>

                      {editingColumnId === col.id ? (
                        <input
                          autoFocus
                          className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-sm font-semibold w-64 outline-none"
                          value={tempColumnName}
                          onChange={(e) => setTempColumnName(e.target.value)}
                          onBlur={handleSaveRename}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                        />
                      ) : (
                        <>
                          <h3
                            onClick={() => handleStartRename(col.id, col.label)}
                            className={`text-sm font-semibold flex items-center gap-1.5 ${isArchived || isIgnoredTable ? 'text-amber-600 dark:text-amber-400' : isDoneTable ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'} ${teamFilter !== 'my-work' ? 'cursor-pointer hover:underline decoration-zinc-400 decoration-dashed underline-offset-4' : ''}`}
                          >
                            {(isArchived || isIgnoredTable) && <Archive size={14} />}
                            {isDoneTable && <CheckCircle size={14} />}
                            {col.label}
                          </h3>
                          {(teamFilter === 'my-work' || teamFilter === 'all') &&
                            (() => {
                              const teamIds = [...new Set(colTasks.map((t) => t.teamId))];
                              const teamNames = teamIds
                                .map((id) => allTeams.find((t) => t.id === id)?.name)
                                .filter(Boolean);
                              return teamNames.length > 0 ? (
                                <span className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500">
                                  {teamNames.join(', ')}
                                </span>
                              ) : null;
                            })()}
                        </>
                      )}
                      <button
                        onClick={() => toggleSection(col.id)}
                        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-all"
                        title={isCollapsed ? 'Show section' : 'Hide section'}
                      >
                        {isCollapsed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>

                      {teamFilter !== 'my-work' && (
                        <div className="relative ml-2">
                          <button
                            ref={(el) => {
                              columnMenuTriggerRefs.current[`table-${col.id}`] = el;
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveColumnMenu(activeColumnMenu === col.id ? null : col.id);
                            }}
                            className="opacity-0 group-hover/header:opacity-100 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-1 transition-opacity"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          <ColumnMenu
                            isOpen={activeColumnMenu === col.id}
                            onClose={() => setActiveColumnMenu(null)}
                            triggerKey={`table-${col.id}`}
                            triggerRefs={columnMenuTriggerRefs}
                            onRename={() => handleStartRename(col.id, col.label)}
                            onDuplicateEmpty={() => {
                              onDuplicateStatus(teamFilter, col.id, false);
                              setActiveColumnMenu(null);
                            }}
                            onDuplicateWithData={() => {
                              onDuplicateStatus(teamFilter, col.id, true);
                              setActiveColumnMenu(null);
                            }}
                            onToggleDone={() => {
                              const current = statusCategories[teamFilter]?.[col.id] || 'active';
                              onSetStatusCategory(teamFilter, col.id, current === 'completed' ? 'active' : 'completed');
                              setActiveColumnMenu(null);
                            }}
                            onArchive={() => {
                              onArchiveStatus(teamFilter, col.id);
                              setActiveColumnMenu(null);
                            }}
                            onDelete={() => handleDeleteColumn(col.id)}
                            isArchived={!!isArchived}
                            isDone={statusCategories[teamFilter]?.[col.id] === 'completed'}
                            isArchiveCategory={statusCategories[teamFilter]?.[col.id] === 'ignored'}
                            onToggleArchiveCategory={() => {
                              const current = statusCategories[teamFilter]?.[col.id] || 'active';
                              onSetStatusCategory(teamFilter, col.id, current === 'ignored' ? 'active' : 'ignored');
                              setActiveColumnMenu(null);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {!isCollapsed && (
                      <>
                        <div
                          className={`border rounded-lg cursor-default overflow-clip ${isArchived || isIgnoredTable ? 'border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10' : isDoneTable ? 'border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-zinc-200 dark:border-zinc-800'}`}
                        >
                          {/* Added table-fixed and specific widths for alignment */}
                          <table className="w-full text-left text-sm border-collapse min-w-[1100px] table-fixed">
                            <thead
                              className={`border-b ${isArchived || isIgnoredTable ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40' : isDoneTable ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}
                            >
                              <tr>
                                <th className="p-3 w-10">
                                  <input
                                    type="checkbox"
                                    ref={(el) => {
                                      if (el) {
                                        const someSelected = colTasks.some((t) => selectedTaskIds.has(t.id));
                                        const allSelected =
                                          colTasks.length > 0 && colTasks.every((t) => selectedTaskIds.has(t.id));
                                        el.indeterminate = someSelected && !allSelected;
                                      }
                                    }}
                                    checked={colTasks.length > 0 && colTasks.every((t) => selectedTaskIds.has(t.id))}
                                    onChange={() => toggleGroupSelection(col.id)}
                                    className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </th>
                                {orderedTableColumns.map((tc) => {
                                  const isProp = tc.key.startsWith('prop:');
                                  const prop = isProp
                                    ? customProperties.find((p) => p.id === tc.key.slice(5))
                                    : undefined;
                                  return (
                                    <th
                                      key={tc.key}
                                      className={`p-3 font-medium text-xs ${tc.className} cursor-pointer select-none transition-colors ${isProp ? 'group/prop relative' : ''} ${isArchived || isIgnoredTable ? 'text-amber-500 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-300' : isDoneTable ? 'text-emerald-500 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                                      onClick={() => handleHeaderSort(tc.key)}
                                    >
                                      {isProp && editingColumnId === prop?.id ? (
                                        <input
                                          autoFocus
                                          className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 text-xs font-semibold w-full outline-none"
                                          value={tempColumnName}
                                          onChange={(e) => setTempColumnName(e.target.value)}
                                          onBlur={handleSaveRename}
                                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <div className="flex items-center justify-between">
                                          <span className="inline-flex items-center gap-1">
                                            <span
                                              className={sortColumn === tc.key ? 'text-zinc-900 dark:text-white' : ''}
                                            >
                                              {tc.label}
                                            </span>
                                            {sortColumn === tc.key &&
                                              (sortDirection === 'asc' ? (
                                                <ChevronUp size={12} className="text-zinc-900 dark:text-white" />
                                              ) : (
                                                <ChevronDown size={12} className="text-zinc-900 dark:text-white" />
                                              ))}
                                          </span>
                                          {isProp && prop && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const key = `${col.id}:${prop.id}`;
                                                setActivePropertyMenu(activePropertyMenu === key ? null : key);
                                              }}
                                              className="opacity-0 group-hover/prop:opacity-100 hover:text-zinc-900 dark:hover:text-white"
                                            >
                                              <MoreHorizontal size={12} />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </th>
                                  );
                                })}
                                <th className="p-2 w-16 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsReorderColumnsOpen(isReorderColumnsOpen === col.id ? null : col.id);
                                        setIsAddPropertyOpen(null);
                                      }}
                                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                      title="Reorder columns"
                                    >
                                      <ArrowLeftRight size={14} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsAddPropertyOpen(isAddPropertyOpen === col.id ? null : col.id);
                                        setIsReorderColumnsOpen(null);
                                      }}
                                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900/40">
                              {colTasks.length > 0 ? (
                                sortTasks(colTasks).map((task) => {
                                  const isDragOver = dragOverTaskId === task.id;
                                  return (
                                    <tr
                                      key={task.id}
                                      draggable={!sortColumn}
                                      onDragStart={(e) => handleDragStart(e, task.id, col.id)}
                                      onDragOver={(e) => !sortColumn && handleTaskDragOver(e, task.id)}
                                      onDragLeave={handleTaskDragLeave}
                                      onDrop={(e) => handleDropOnTask(e, task.id, col.id)}
                                      className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/80 transition-colors group ${!sortColumn ? 'cursor-grab active:cursor-grabbing' : ''} relative ${selectedTaskIds.has(task.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                                      style={
                                        isDragOver && !sortColumn
                                          ? {
                                              borderTop:
                                                dragPosition === 'above' ? '2px solid rgb(59 130 246)' : undefined,
                                              borderBottom:
                                                dragPosition === 'below' ? '2px solid rgb(59 130 246)' : undefined,
                                            }
                                          : undefined
                                      }
                                      onClick={() => onTaskClick(task)}
                                    >
                                      <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={selectedTaskIds.has(task.id)}
                                          onChange={(e) =>
                                            toggleTaskSelection(
                                              task.id,
                                              e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey,
                                            )
                                          }
                                          className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                      </td>
                                      {/* Data-driven cells */}
                                      {orderedTableColumns.map((tc) => {
                                        switch (tc.key) {
                                          case 'title':
                                            return (
                                              <td
                                                key={tc.key}
                                                className="p-3 font-medium text-zinc-900 dark:text-zinc-100 border-r border-transparent group-hover:border-zinc-100 dark:group-hover:border-zinc-800 truncate"
                                              >
                                                <div className="flex items-center gap-2">
                                                  {!sortColumn && (
                                                    <GripVertical
                                                      size={12}
                                                      className="text-zinc-300 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                                    />
                                                  )}
                                                  {isLinkedCopy(task) && (
                                                    <Link2 size={12} className="text-blue-500 flex-shrink-0" />
                                                  )}
                                                  <span className="truncate">{task.title}</span>
                                                </div>
                                              </td>
                                            );
                                          case 'type':
                                            return (
                                              <td key={tc.key} className="p-3">
                                                {task.contentInfo?.type ? (
                                                  <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">
                                                    {task.contentInfo.type}
                                                  </span>
                                                ) : (
                                                  <span className="text-zinc-300 dark:text-zinc-600 text-sm">—</span>
                                                )}
                                              </td>
                                            );
                                          case 'assignee':
                                          case 'editor': {
                                            const personKey = tc.key;
                                            const selectedIds =
                                              personKey === 'assignee'
                                                ? task.assigneeIds
                                                : task.contentInfo?.editorIds || [];
                                            const handleChange = (ids: string[]) => {
                                              if (personKey === 'assignee') {
                                                onUpdateTask({ ...task, assigneeIds: ids });
                                              } else {
                                                onUpdateTask({
                                                  ...task,
                                                  contentInfo: { ...task.contentInfo!, editorIds: ids },
                                                });
                                              }
                                            };
                                            return (
                                              <td key={tc.key} className="p-3" onClick={(e) => e.stopPropagation()}>
                                                <MultiSelect
                                                  icon={personKey === 'editor' ? Eye : User}
                                                  label=""
                                                  options={members.map((m) => ({ value: m.id, label: m.name }))}
                                                  selected={selectedIds}
                                                  onChange={handleChange}
                                                  placeholder="—"
                                                  className="min-w-0"
                                                  compact
                                                  renderTrigger={(onClick, sIds) => {
                                                    const people = members.filter((m) => sIds.includes(m.id));
                                                    return (
                                                      <div
                                                        onClick={onClick}
                                                        className="flex flex-col gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-h-[24px]"
                                                      >
                                                        {people.length > 0 ? (
                                                          people.map((p) => (
                                                            <div key={p.id} className="flex items-center gap-1.5">
                                                              <Avatar
                                                                src={p.avatar}
                                                                alt={p.name}
                                                                size="sm"
                                                                className="flex-shrink-0"
                                                              />
                                                              <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                                                {p.name}
                                                              </span>
                                                            </div>
                                                          ))
                                                        ) : (
                                                          <span className="text-xs text-zinc-400">—</span>
                                                        )}
                                                      </div>
                                                    );
                                                  }}
                                                />
                                              </td>
                                            );
                                          }
                                          case 'priority':
                                            return (
                                              <td key={tc.key} className="p-3" onClick={(e) => e.stopPropagation()}>
                                                <CustomSelect
                                                  compact
                                                  options={[
                                                    { value: 'low', label: 'Low' },
                                                    { value: 'medium', label: 'Medium' },
                                                    { value: 'high', label: 'High' },
                                                  ]}
                                                  value={task.priority}
                                                  onChange={(val) =>
                                                    onUpdateTask({ ...task, priority: val as Priority })
                                                  }
                                                  renderValue={(val) => (
                                                    <span
                                                      className={`inline-flex items-center gap-1.5 text-xs capitalize ${PRIORITY_COLORS[val] || ''}`}
                                                    >
                                                      <span
                                                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[val] || ''}`}
                                                      />
                                                      {val}
                                                    </span>
                                                  )}
                                                />
                                              </td>
                                            );
                                          case 'deadline':
                                            return (
                                              <td key={tc.key} className="p-3" onClick={(e) => e.stopPropagation()}>
                                                <SimpleDatePicker
                                                  value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                                                  onChange={(date) =>
                                                    onUpdateTask({
                                                      ...task,
                                                      dueDate: new Date(date).toISOString(),
                                                    })
                                                  }
                                                  placeholder="Set date"
                                                  renderTrigger={(onClick, value) => {
                                                    const urgency = getDeadlineUrgency(value || undefined);
                                                    return (
                                                      <span
                                                        onClick={onClick}
                                                        className={`text-xs flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1.5 py-0.5 cursor-pointer transition-colors ${value ? urgency.text : 'text-zinc-500'}`}
                                                      >
                                                        {value && urgency.dot && (
                                                          <span
                                                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${urgency.dot}`}
                                                          />
                                                        )}
                                                        {value
                                                          ? new Date(value + 'T00:00:00').toLocaleDateString('en-US')
                                                          : 'Set date'}
                                                      </span>
                                                    );
                                                  }}
                                                />
                                              </td>
                                            );
                                          case 'done':
                                            return (
                                              <td key={tc.key} className="p-3" onClick={(e) => e.stopPropagation()}>
                                                <SimpleDatePicker
                                                  value={task.doneDate ? task.doneDate.split('T')[0] : ''}
                                                  onChange={(date) =>
                                                    onUpdateTask({
                                                      ...task,
                                                      doneDate: new Date(date).toISOString(),
                                                    })
                                                  }
                                                  placeholder="Set date"
                                                  renderTrigger={(onClick, value) => (
                                                    <span
                                                      onClick={onClick}
                                                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                                                    >
                                                      {value
                                                        ? new Date(value + 'T00:00:00').toLocaleDateString('en-US')
                                                        : 'Set date'}
                                                    </span>
                                                  )}
                                                />
                                              </td>
                                            );
                                          case 'links':
                                            return (
                                              <td key={tc.key} className="p-3">
                                                {task.links && task.links.length > 0 ? (
                                                  <div className="flex items-center gap-1">
                                                    {task.links.slice(0, 3).map((link, i) => {
                                                      let hostname = '';
                                                      try {
                                                        hostname = new URL(link.url).hostname;
                                                      } catch {
                                                        /* ignore */
                                                      }
                                                      return (
                                                        <a
                                                          key={i}
                                                          href={link.url}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          onClick={(e) => e.stopPropagation()}
                                                          title={link.title || link.url}
                                                          className="flex-shrink-0 w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors"
                                                        >
                                                          <img
                                                            src={
                                                              hostname ? getFaviconUrl(link.url, hostname) : undefined
                                                            }
                                                            alt=""
                                                            className="w-3.5 h-3.5"
                                                            onError={(e) => {
                                                              const img = e.target as HTMLImageElement;
                                                              img.style.display = 'none';
                                                              img.parentElement!.innerHTML =
                                                                '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
                                                            }}
                                                          />
                                                        </a>
                                                      );
                                                    })}
                                                    {task.links.length > 3 && (
                                                      <span className="text-[11px] text-zinc-400 flex-shrink-0">
                                                        +{task.links.length - 3}
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-zinc-300 dark:text-zinc-600 text-sm">—</span>
                                                )}
                                              </td>
                                            );
                                          case 'placements':
                                            return (
                                              <td key={tc.key} className="p-3">
                                                {task.placements.length > 0 ? (
                                                  <div className="flex flex-col gap-1">
                                                    {task.placements.slice(0, 2).map((p, i) => (
                                                      <span
                                                        key={`${p}-${i}`}
                                                        className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded w-fit"
                                                      >
                                                        {p}
                                                      </span>
                                                    ))}
                                                    {task.placements.length > 2 && (
                                                      <span className="text-[11px] text-zinc-400">
                                                        +{task.placements.length - 2}
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-zinc-300 dark:text-zinc-600 text-sm">—</span>
                                                )}
                                              </td>
                                            );
                                          default: {
                                            // Custom properties
                                            if (tc.key.startsWith('prop:')) {
                                              const propId = tc.key.slice(5);
                                              const prop = customProperties.find((p) => p.id === propId);
                                              const fieldValues = getTaskFieldsInTeam(task);
                                              const val = fieldValues[propId];
                                              if (prop?.type === 'person' && val) {
                                                const personIds = Array.isArray(val) ? val : [val];
                                                const people = members.filter((m) => personIds.includes(m.id));
                                                return (
                                                  <td key={tc.key} className="p-3">
                                                    {people.length > 0 ? (
                                                      <div className="flex flex-col gap-1">
                                                        {people.map((p) => (
                                                          <div key={p.id} className="flex items-center gap-1.5">
                                                            <Avatar
                                                              src={p.avatar}
                                                              alt={p.name}
                                                              size="sm"
                                                              className="flex-shrink-0"
                                                            />
                                                            <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                                              {p.name}
                                                            </span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    ) : (
                                                      <span className="text-xs text-zinc-400">-</span>
                                                    )}
                                                  </td>
                                                );
                                              }
                                              if (prop?.type === 'tags') {
                                                const tagVals: string[] = Array.isArray(val) ? val : val ? [val] : [];
                                                return (
                                                  <td key={tc.key} className="p-3" onClick={(e) => e.stopPropagation()}>
                                                    <TagSelect
                                                      tags={prop.options || []}
                                                      selected={tagVals}
                                                      tagColors={prop.optionColors || {}}
                                                      onChange={(tags) =>
                                                        onUpdateTask({
                                                          ...task,
                                                          customFieldValues: {
                                                            ...task.customFieldValues,
                                                            [propId]: tags,
                                                          },
                                                        })
                                                      }
                                                      onAddTag={(name, color) => {
                                                        if (onUpdateProperty) {
                                                          onUpdateProperty({
                                                            ...prop,
                                                            options: [...(prop.options || []), name],
                                                            optionColors: {
                                                              ...(prop.optionColors || {}),
                                                              [name]: color,
                                                            },
                                                          });
                                                        }
                                                      }}
                                                      onUpdateTagColor={(name, color) => {
                                                        if (onUpdateProperty) {
                                                          onUpdateProperty({
                                                            ...prop,
                                                            optionColors: {
                                                              ...(prop.optionColors || {}),
                                                              [name]: color,
                                                            },
                                                          });
                                                        }
                                                      }}
                                                      onDeleteTag={(name) => {
                                                        if (onUpdateProperty) {
                                                          const newColors = { ...(prop.optionColors || {}) };
                                                          delete newColors[name];
                                                          onUpdateProperty({
                                                            ...prop,
                                                            options: (prop.options || []).filter((o) => o !== name),
                                                            optionColors: newColors,
                                                          });
                                                          if (Array.isArray(val) && val.includes(name)) {
                                                            onUpdateTask({
                                                              ...task,
                                                              customFieldValues: {
                                                                ...task.customFieldValues,
                                                                [propId]: val.filter((t: string) => t !== name),
                                                              },
                                                            });
                                                          }
                                                        }
                                                      }}
                                                      compact
                                                      maxVisible={3}
                                                    />
                                                  </td>
                                                );
                                              }
                                              return (
                                                <td
                                                  key={tc.key}
                                                  className="p-3 text-xs text-zinc-600 dark:text-zinc-400 truncate"
                                                >
                                                  {val ? String(val) : '-'}
                                                </td>
                                              );
                                            }
                                            return <td key={tc.key} className="p-3" />;
                                          }
                                        }
                                      })}
                                      <td className="p-3"></td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td
                                    colSpan={orderedTableColumns.length + 2}
                                    className="p-4 text-center text-xs text-zinc-400 italic"
                                  >
                                    No tasks in this step
                                  </td>
                                </tr>
                              )}
                              {/* Add Task Row */}
                              {!searchQuery && teamFilter !== 'my-work' && (
                                <tr
                                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                  onClick={() => onAddTask({ status: col.id })}
                                >
                                  <td
                                    colSpan={orderedTableColumns.length + 2}
                                    className="p-2 pl-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs font-medium"
                                  >
                                    <span className="flex items-center gap-2">
                                      <Plus size={14} /> Add Task
                                    </span>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {activePropertyMenu?.startsWith(`${col.id}:`) &&
                          (() => {
                            const propId = activePropertyMenu.split(':')[1];
                            const prop = customProperties.find((p) => p.id === propId);
                            if (!prop) return null;
                            return (
                              <div
                                className="absolute right-12 top-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1 w-44"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    handleStartRename(prop.id, prop.name);
                                    setActivePropertyMenu(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs"
                                >
                                  <Edit2 size={12} /> Rename
                                </button>
                                <Divider className="my-1" />
                                <p className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase">
                                  Change Type
                                </p>
                                {[
                                  { type: 'text' as const, icon: Type, label: 'Text' },
                                  { type: 'select' as const, icon: ListIcon, label: 'Select' },
                                  { type: 'tags' as const, icon: TagsIcon, label: 'Tags' },
                                  { type: 'date' as const, icon: CalendarIcon, label: 'Date' },
                                  { type: 'person' as const, icon: Users, label: 'Person' },
                                ].map(({ type, icon: Icon, label }) => (
                                  <button
                                    key={type}
                                    onClick={() => {
                                      if (onUpdateProperty) {
                                        onUpdateProperty({ ...prop, type });
                                      }
                                      setActivePropertyMenu(null);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs ${prop.type === type ? 'text-black dark:text-white font-medium' : ''}`}
                                  >
                                    <Icon size={12} /> {label} {prop.type === type && '(current)'}
                                  </button>
                                ))}
                                <Divider className="my-1" />
                                <button
                                  onClick={() => handleDeleteProperty(prop.id)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 text-xs text-red-500"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            );
                          })()}
                        {isAddPropertyOpen === col.id && (
                          <div
                            className="absolute right-0 top-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-3 w-56 text-left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <h4 className="text-xs font-semibold text-zinc-900 dark:text-white mb-2">New Property</h4>
                            <input
                              className="w-full p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-zinc-400 mb-2"
                              placeholder="Property Name"
                              value={newPropName}
                              onChange={(e) => setNewPropName(e.target.value)}
                              autoFocus
                            />
                            <div className="space-y-1 mb-3">
                              <button
                                onClick={() => setNewPropType('text')}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === 'text' ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                              >
                                <Type size={12} /> Text
                              </button>
                              <button
                                onClick={() => setNewPropType('select')}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === 'select' ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                              >
                                <ListIcon size={12} /> Select
                              </button>
                              <button
                                onClick={() => setNewPropType('tags')}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === 'tags' ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                              >
                                <TagsIcon size={12} /> Tags
                              </button>
                              <button
                                onClick={() => setNewPropType('date')}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === 'date' ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                              >
                                <CalendarIcon size={12} /> Date
                              </button>
                              <button
                                onClick={() => setNewPropType('person')}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 ${newPropType === 'person' ? 'bg-zinc-100 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                              >
                                <Users size={12} /> Person
                              </button>
                            </div>
                            <Button size="sm" onClick={handleCreateProperty} className="w-full">
                              Create
                            </Button>
                          </div>
                        )}
                        {isReorderColumnsOpen === col.id && (
                          <div
                            className="absolute right-0 top-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-3 w-56 text-left max-h-[400px] overflow-y-auto custom-scrollbar"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-zinc-900 dark:text-white">Reorder Columns</h4>
                              <button
                                onClick={() => setIsReorderColumnsOpen(null)}
                                className="p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <div className="space-y-1">
                              {orderedTableColumns.map((tc, idx) => (
                                <div
                                  key={tc.key}
                                  className="flex items-center justify-between px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800/50 text-xs"
                                >
                                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{tc.label}</span>
                                  <div className="flex items-center gap-0.5 flex-shrink-0">
                                    <button
                                      onClick={() => {
                                        if (idx === 0) return;
                                        const keys = orderedTableColumns.map((c) => c.key);
                                        [keys[idx - 1], keys[idx]] = [keys[idx], keys[idx - 1]];
                                        reorderColumns(keys);
                                      }}
                                      disabled={idx === 0}
                                      className="p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <ChevronUp size={14} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (idx === orderedTableColumns.length - 1) return;
                                        const keys = orderedTableColumns.map((c) => c.key);
                                        [keys[idx], keys[idx + 1]] = [keys[idx + 1], keys[idx]];
                                        reorderColumns(keys);
                                      }}
                                      disabled={idx === orderedTableColumns.length - 1}
                                      className="p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <ChevronDown size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

            {!searchQuery && teamFilter !== 'my-work' && (
              <button
                onClick={handleAddColumn}
                className="flex items-center gap-2 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white text-sm font-medium transition-colors py-2"
              >
                <Plus size={16} />
                Add Status
              </button>
            )}
          </div>
        )}

        {/* Floating Bulk Action Bar */}
        {viewMode === 'table' && selectedCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className="flex items-center gap-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full px-5 py-2.5 shadow-2xl text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <Check size={14} />
                {selectedCount} selected
              </span>
              <div className="w-px h-4 bg-zinc-700 dark:bg-zinc-300" />
              <div className="relative">
                <button
                  onClick={() => setBulkStatusMenuOpen(!bulkStatusMenuOpen)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  <ArrowRight size={14} />
                  Move to…
                  <ChevronUp size={12} />
                </button>
                {bulkStatusMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] text-zinc-900 dark:text-zinc-100">
                    {displayColumns.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => handleBulkMove(col.id)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-zinc-400" />
                        {col.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {onDeleteTask && (
                <>
                  <div className="w-px h-4 bg-zinc-700 dark:bg-zinc-300" />
                  <button
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-red-600 dark:hover:bg-red-500 transition-colors text-red-400 dark:text-red-400 hover:text-white dark:hover:text-white"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              )}
              <div className="w-px h-4 bg-zinc-700 dark:bg-zinc-300" />
              <button
                onClick={clearSelection}
                className="p-1 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                title="Clear selection"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="h-full flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden relative">
            {/* Calendar Controls */}
            <div className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeMonth(-1)}
                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600"
                >
                  <ChevronLeft size={16} />
                </button>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white w-32 text-center">
                  {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                </h3>
                <button
                  onClick={() => changeMonth(1)}
                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div></div>
            </div>

            <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex-shrink-0">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div
                  key={d}
                  className="p-2 text-center text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Full Height Grid with Scroll Fix */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-black custom-scrollbar">
              <div className="grid grid-cols-7 auto-rows-fr border-b border-zinc-200 dark:border-zinc-800 h-full min-h-[500px]">
                {calendarDays.map((dateObj, i) => {
                  const isCurrentMonth = dateObj.type === 'current';
                  const isToday = isCurrentMonth && dateObj.date.toDateString() === new Date().toDateString();
                  const dateStr = dateObj.date.toISOString();

                  if (!isCurrentMonth) {
                    const overflowTasks = filteredTasks.filter(
                      (t) => new Date(t.dueDate).toDateString() === dateObj.date.toDateString(),
                    );
                    return (
                      <div
                        key={i}
                        className="flex flex-col min-h-[100px] bg-zinc-100 dark:bg-zinc-900/60 border-b border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
                      >
                        <div className="p-1 text-[10px] font-medium text-right text-zinc-400 dark:text-zinc-500">
                          {dateObj.day}
                        </div>
                        {overflowTasks.length > 0 && (
                          <div className="flex-1 p-1 space-y-1 overflow-y-auto max-h-[130px] custom-scrollbar">
                            {overflowTasks.map((t) => (
                              <div key={t.id} onClick={() => onTaskClick(t)} className="cursor-pointer">
                                <div className="text-[10px] px-1.5 py-1 rounded border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-400 dark:text-zinc-500 truncate leading-tight">
                                  {t.title}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const dayTasks = filteredTasks.filter(
                    (t) => new Date(t.dueDate).toDateString() === dateObj.date.toDateString(),
                  );

                  return (
                    <div
                      key={i}
                      className={`flex flex-col min-h-[100px] relative transition-colors border-b border-r border-zinc-200 dark:border-zinc-800 group/cell last:border-r-0 ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/20' : 'bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900/20'}`}
                      onClick={() => teamFilter !== 'my-work' && onAddTask({ dueDate: dateStr })}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropDate(e, dateStr)}
                    >
                      <div
                        className={`p-1 text-[10px] font-medium text-right ${isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-zinc-400'} group-hover/cell:text-zinc-900 dark:group-hover/cell:text-zinc-100`}
                      >
                        {dateObj.day}
                      </div>
                      <div className="flex-1 p-1 space-y-1 overflow-y-auto max-h-[130px] custom-scrollbar">
                        {dayTasks.map((t) => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTaskClick(t);
                            }}
                            draggable
                            onDragStart={(e) => handleDragStart(e, t.id, getTaskStatusInTeam(t))}
                            className="group cursor-grab active:cursor-grabbing"
                          >
                            <div
                              className={`text-[10px] px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 border-l-[3px] shadow-sm bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center gap-1 ${getStatusAccent(getTaskStatusInTeam(t))}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-zinc-400'}`}
                                title={t.priority}
                              />
                              <span className="font-medium truncate leading-tight">{t.title}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Add Button on Hover */}
                      <div className="absolute top-1 left-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                        <button className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-black dark:hover:text-white">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Bulk Delete Confirmation Modal */}
      <Modal
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        title="Move to Bin"
        size="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setBulkDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (onDeleteTask) selectedTaskIds.forEach((id) => onDeleteTask(id));
                setBulkDeleteConfirmOpen(false);
                clearSelection();
              }}
            >
              Move to Bin
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {selectedTaskIds.size === 1
            ? 'This task will be moved to the bin and can be restored within 30 days.'
            : `${selectedTaskIds.size} tasks will be moved to the bin and can be restored within 30 days.`}
        </p>
      </Modal>
    </div>
  );
};

export default Workspace;
