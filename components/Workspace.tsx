import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { Task, TaskStatus, TeamType, Member, Priority, Team, CustomProperty, UserRole } from '../types';
import { PRIORITY_COLORS, PRIORITY_DOT, getStatusAccent } from '../constants';
import {
  Plus,
  MoreHorizontal,
  Calendar as CalendarIcon,
  User,
  Wand2,
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
} from 'lucide-react';
import { generateContentIdeas } from '../services/geminiService';
import { MultiSelect } from './MultiSelect';
import { CustomSelect } from './CustomSelect';
import { SimpleDatePicker } from './SimpleDatePicker';
import { Avatar } from './Avatar';

// Shared column context menu used in both board and table views
const ColumnMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDuplicateEmpty: () => void;
  onDuplicateWithData: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isArchived: boolean;
}> = ({ isOpen, onClose, onRename, onDuplicateEmpty, onDuplicateWithData, onArchive, onDelete, isArchived }) => {
  if (!isOpen) return null;
  return (
    <div
      className="absolute right-0 top-6 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 py-1 flex flex-col text-xs"
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
      <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>
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
    </div>
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
  onArchiveStatus: (teamId: string, status: string) => void;
  onDuplicateStatus: (teamId: string, status: string, withData: boolean) => void;
  customProperties?: CustomProperty[];
  onAddProperty?: (property: CustomProperty) => void;
  onUpdateProperty?: (property: CustomProperty) => void;
  onDeleteProperty?: (propertyId: string) => void;
  onReorderProperties?: (orderedIds: string[]) => void;
  userRole?: UserRole;
  onReorderTask?: (taskId: string, targetTaskId: string, position: 'before' | 'after') => void;
  allPlacements: string[];
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
  onArchiveStatus,
  onDuplicateStatus,
  customProperties = [],
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onReorderProperties,
  userRole,
  onReorderTask,
  allPlacements = [],
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
  const [isReorderPropsOpen, setIsReorderPropsOpen] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<CustomProperty['type']>('text');

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

  // Determine current column list
  const currentStatusList = useMemo(() => {
    if (teamFilter === 'my-work') {
      // Dynamic columns for My Work based on user's tasks
      const myTasks = tasks.filter(
        (t) =>
          t.assigneeIds.includes(currentUserId) ||
          t.contentInfo?.editorIds?.includes(currentUserId) ||
          t.contentInfo?.designerIds?.includes(currentUserId),
      );
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
  }, [teamStatuses, teamFilter, tasks, currentUserId]);

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
  const [activePropertyMenu, setActivePropertyMenu] = useState<string | null>(null);

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Filters State
  const [filterPerson, setFilterPerson] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterPlacements, setFilterPlacements] = useState<string[]>([]);

  // Filtering Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      let matchTeam = false;
      if (teamFilter === 'my-work') {
        matchTeam =
          t.assigneeIds.includes(currentUserId) ||
          (t.contentInfo?.editorIds?.includes(currentUserId) ?? false) ||
          (t.contentInfo?.designerIds?.includes(currentUserId) ?? false);
      } else {
        matchTeam = teamFilter === 'all' || t.teamId === teamFilter;
      }

      // Apply Person filter only if NOT in 'my-work'
      const matchPerson = teamFilter === 'my-work' || filterPerson === 'all' || t.assigneeIds.includes(filterPerson);
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
  }, [tasks, teamFilter, filterPerson, filterPriority, filterPlacements, searchQuery, currentUserId]);

  // Derived columns to display: If searching, only show columns with tasks; then apply status sort
  const displayColumns = useMemo(() => {
    let cols = searchQuery ? columns.filter((col) => filteredTasks.some((t) => t.status === col.id)) : [...columns];

    if (statusSort) {
      const dir = statusSortDirection === 'asc' ? 1 : -1;
      cols = [...cols].sort((a, b) => {
        switch (statusSort) {
          case 'name':
            return dir * a.label.localeCompare(b.label);
          case 'count': {
            const countA = filteredTasks.filter((t) => t.status === a.id).length;
            const countB = filteredTasks.filter((t) => t.status === b.id).length;
            return dir * (countA - countB);
          }
          default:
            return 0;
        }
      });
    }

    return cols;
  }, [columns, filteredTasks, searchQuery, statusSort, statusSortDirection]);

  const getMembersByIds = (ids: string[]) => members.filter((m) => ids.includes(m.id));

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
    if (userRole !== 'admin') {
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
        case 'type':
          return dir * (a.contentInfo?.type || '').localeCompare(b.contentInfo?.type || '');
        case 'assignee': {
          const nameA = members.find((m) => a.assigneeIds[0] === m.id)?.name || '';
          const nameB = members.find((m) => b.assigneeIds[0] === m.id)?.name || '';
          return dir * nameA.localeCompare(nameB);
        }
        default:
          return 0;
      }
    });
  };

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
            <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800"></div>
            {/* View Switcher */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all text-xs font-medium ${viewMode === 'table' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <List size={14} /> Table
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all text-xs font-medium ${viewMode === 'board' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <LayoutGrid size={14} /> Board
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all text-xs font-medium ${viewMode === 'calendar' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <CalendarIcon size={14} /> Calendar
              </button>
            </div>
          </div>

          {/* Actions: AI & New Task */}
          <div className="flex gap-2 items-center">
            {/* Show Archived and AI Assist hidden for now */}
            <button
              onClick={() => onAddTask()}
              className="flex items-center gap-1.5 bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus size={14} />
              New
            </button>
          </div>
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

          {/* Status group sort */}
          {(viewMode === 'table' || viewMode === 'board') && (
            <>
              <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 mx-1"></div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mr-1">
                  Sort groups:
                </span>
                <button
                  onClick={() => handleStatusSort('name')}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${statusSort === 'name' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900 dark:hover:text-white'}`}
                >
                  Name
                  {statusSort === 'name' &&
                    (statusSortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
                <button
                  onClick={() => handleStatusSort('count')}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${statusSort === 'count' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900 dark:hover:text-white'}`}
                >
                  Count
                  {statusSort === 'count' &&
                    (statusSortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden h-full flex flex-col relative">
        {displayColumns.length === 0 && searchQuery && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
            <p>No tasks found for "{searchQuery}"</p>
          </div>
        )}

        {viewMode === 'board' && displayColumns.length > 0 && (
          <div className="flex gap-6 overflow-x-auto pb-4 h-full">
            {displayColumns.map((col) => {
              const isCollapsed = collapsedSections[col.id];
              const isArchived = archivedStatuses[teamFilter]?.includes(col.id);
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
                        <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-bold px-1.5 rounded">
                          {filteredTasks.filter((t) => t.status === col.id).length}
                        </span>
                        <div
                          className="writing-mode-vertical text-xs font-bold text-zinc-500 tracking-wider whitespace-nowrap rotate-180"
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
                              className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-xs font-bold w-full outline-none"
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
                              <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                {filteredTasks.filter((t) => t.status === col.id).length}
                              </span>
                              <span
                                onClick={() => handleStartRename(col.id, col.label)}
                                className={`font-semibold text-zinc-900 dark:text-white text-xs ${teamFilter !== 'my-work' ? 'hover:underline decoration-zinc-400 decoration-dashed underline-offset-4' : ''}`}
                              >
                                {col.label} {isArchived && '(Archived)'}
                              </span>
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveColumnMenu(activeColumnMenu === col.id ? null : col.id);
                                }}
                                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-1"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                              <button
                                onClick={() => onAddTask({ status: col.id })}
                                className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors p-1"
                              >
                                <Plus size={14} />
                              </button>
                            </div>

                            <ColumnMenu
                              isOpen={activeColumnMenu === col.id}
                              onClose={() => setActiveColumnMenu(null)}
                              onRename={() => handleStartRename(col.id, col.label)}
                              onDuplicateEmpty={() => {
                                onDuplicateStatus(teamFilter, col.id, false);
                                setActiveColumnMenu(null);
                              }}
                              onDuplicateWithData={() => {
                                onDuplicateStatus(teamFilter, col.id, true);
                                setActiveColumnMenu(null);
                              }}
                              onArchive={() => {
                                onArchiveStatus(teamFilter, col.id);
                                setActiveColumnMenu(null);
                              }}
                              onDelete={() => handleDeleteColumn(col.id)}
                              isArchived={!!isArchived}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div
                      className={`flex-1 flex flex-col min-h-0 rounded-lg p-1 ${isArchived ? 'bg-yellow-50/30 dark:bg-yellow-900/10 border border-dashed border-yellow-200 dark:border-yellow-900/30' : 'bg-zinc-50/50 dark:bg-zinc-900/30'}`}
                    >
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {sortTasks(filteredTasks.filter((t) => t.status === col.id)).map((task) => {
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
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                                      {task.contentInfo.type}
                                    </span>
                                  )}
                                </div>
                                <div className="text-zinc-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                                  <GripVertical size={14} />
                                </div>
                              </div>
                              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2 leading-snug">
                                {task.title}
                              </h3>

                              <div className="flex flex-wrap gap-1 mb-3">
                                {task.placements.map((placement) => (
                                  <span
                                    key={placement}
                                    className="text-[10px] bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border border-zinc-100 dark:border-zinc-700 px-1 rounded-sm"
                                  >
                                    #{placement}
                                  </span>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                  <CalendarIcon size={12} />
                                  <span>
                                    {new Date(task.dueDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                </div>
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
                                    <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-[8px] border border-white dark:border-zinc-900">
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
        )}

        {viewMode === 'table' && (
          <div className="h-full overflow-y-auto custom-scrollbar space-y-8 pr-2 pb-10">
            {displayColumns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);
              const isCollapsed = collapsedSections[col.id];
              const isArchived = archivedStatuses[teamFilter]?.includes(col.id);

              return (
                <div
                  key={col.id}
                  className={`space-y-2 group/section relative ${isArchived ? 'opacity-70' : ''}`}
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
                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs px-2 py-0.5 rounded font-medium">
                      {colTasks.length}
                    </span>

                    {editingColumnId === col.id ? (
                      <input
                        autoFocus
                        className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 text-sm font-bold w-64 outline-none"
                        value={tempColumnName}
                        onChange={(e) => setTempColumnName(e.target.value)}
                        onBlur={handleSaveRename}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                      />
                    ) : (
                      <h3
                        onClick={() => handleStartRename(col.id, col.label)}
                        className={`text-sm font-bold text-zinc-900 dark:text-white ${teamFilter !== 'my-work' ? 'cursor-pointer hover:underline decoration-zinc-400 decoration-dashed underline-offset-4' : ''}`}
                      >
                        {col.label} {isArchived && '(Archived)'}
                      </h3>
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
                          onRename={() => handleStartRename(col.id, col.label)}
                          onDuplicateEmpty={() => {
                            onDuplicateStatus(teamFilter, col.id, false);
                            setActiveColumnMenu(null);
                          }}
                          onDuplicateWithData={() => {
                            onDuplicateStatus(teamFilter, col.id, true);
                            setActiveColumnMenu(null);
                          }}
                          onArchive={() => {
                            onArchiveStatus(teamFilter, col.id);
                            setActiveColumnMenu(null);
                          }}
                          onDelete={() => handleDeleteColumn(col.id)}
                          isArchived={!!isArchived}
                        />
                      </div>
                    )}
                  </div>

                  {!isCollapsed && (
                    <>
                      <div
                        className={`overflow-visible border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-default ${isArchived ? 'bg-yellow-50/10' : ''}`}
                      >
                        {/* Added table-fixed and specific widths for alignment */}
                        <table className="w-full text-left text-sm border-collapse min-w-[800px] table-fixed">
                          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                              {[
                                { key: 'title', label: 'Title', className: 'w-[25%]' },
                                { key: 'type', label: 'Type', className: 'w-32' },
                                { key: 'assignee', label: 'Assignee', className: 'w-32' },
                                { key: 'priority', label: 'Priority', className: 'w-24' },
                                { key: 'deadline', label: 'Deadline', className: 'w-24' },
                              ].map((col) => (
                                <th
                                  key={col.key}
                                  className={`p-3 font-medium text-zinc-400 text-xs ${col.className} cursor-pointer select-none hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors`}
                                  onClick={() => handleHeaderSort(col.key)}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <span className={sortColumn === col.key ? 'text-zinc-900 dark:text-white' : ''}>
                                      {col.label}
                                    </span>
                                    {sortColumn === col.key &&
                                      (sortDirection === 'asc' ? (
                                        <ChevronUp size={12} className="text-zinc-900 dark:text-white" />
                                      ) : (
                                        <ChevronDown size={12} className="text-zinc-900 dark:text-white" />
                                      ))}
                                  </span>
                                </th>
                              ))}
                              {customProperties.map((prop) => (
                                <th
                                  key={prop.id}
                                  className="p-3 font-medium text-zinc-400 text-xs w-32 group/prop cursor-pointer relative"
                                >
                                  {editingColumnId === prop.id ? (
                                    <input
                                      autoFocus
                                      className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 text-xs font-bold w-full outline-none"
                                      value={tempColumnName}
                                      onChange={(e) => setTempColumnName(e.target.value)}
                                      onBlur={handleSaveRename}
                                      onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <div
                                      className="flex items-center justify-between"
                                      onClick={() => handleStartRename(prop.id, prop.name)}
                                    >
                                      {prop.name}
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
                                    </div>
                                  )}
                                </th>
                              ))}
                              <th className="p-3 font-medium text-zinc-400 text-xs w-32">Placements</th>
                              <th className="p-2 w-16 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  {customProperties.length > 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsReorderPropsOpen(isReorderPropsOpen === col.id ? null : col.id);
                                        setIsAddPropertyOpen(null);
                                      }}
                                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                      title="Reorder columns"
                                    >
                                      <ArrowLeftRight size={14} />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsAddPropertyOpen(isAddPropertyOpen === col.id ? null : col.id);
                                      setIsReorderPropsOpen(null);
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
                                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/80 transition-colors group ${!sortColumn ? 'cursor-grab active:cursor-grabbing' : ''} relative`}
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
                                    {/* Title — read-only, opens modal */}
                                    <td className="p-3 font-medium text-zinc-900 dark:text-zinc-100 border-r border-transparent group-hover:border-zinc-100 dark:group-hover:border-zinc-800 flex items-center gap-2 truncate">
                                      {!sortColumn && (
                                        <GripVertical
                                          size={12}
                                          className="text-zinc-300 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                        />
                                      )}
                                      <span className="truncate">{task.title}</span>
                                    </td>
                                    {/* Type — read-only */}
                                    <td className="p-3 text-zinc-600 dark:text-zinc-400 text-xs truncate">
                                      {task.contentInfo?.type || task.teamId}
                                    </td>
                                    {/* Assignee — inline MultiSelect with avatar trigger */}
                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                      <MultiSelect
                                        icon={User}
                                        label=""
                                        options={members.map((m) => ({ value: m.id, label: m.name }))}
                                        selected={task.assigneeIds}
                                        onChange={(ids) => onUpdateTask({ ...task, assigneeIds: ids })}
                                        placeholder="—"
                                        className="min-w-0"
                                        compact
                                        renderTrigger={(onClick, selectedIds) => {
                                          const assignees = members.filter((m) => selectedIds.includes(m.id));
                                          return (
                                            <div
                                              onClick={onClick}
                                              className="flex flex-col gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-h-[24px]"
                                            >
                                              {assignees.length > 0 ? (
                                                assignees.map((a) => (
                                                  <div key={a.id} className="flex items-center gap-1.5">
                                                    <Avatar
                                                      src={a.avatar}
                                                      alt={a.name}
                                                      size="sm"
                                                      className="flex-shrink-0"
                                                    />
                                                    <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                                      {a.name}
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
                                    {/* Priority — inline CustomSelect */}
                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                      <CustomSelect
                                        compact
                                        options={[
                                          { value: 'low', label: 'Low' },
                                          { value: 'medium', label: 'Medium' },
                                          { value: 'high', label: 'High' },
                                        ]}
                                        value={task.priority}
                                        onChange={(val) => onUpdateTask({ ...task, priority: val as Priority })}
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
                                    {/* Due Date — inline SimpleDatePicker */}
                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                      <SimpleDatePicker
                                        value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                                        onChange={(date) =>
                                          onUpdateTask({ ...task, dueDate: new Date(date).toISOString() })
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

                                    {/* Custom Properties */}
                                    {customProperties.map((prop) => {
                                      const val = task.customFieldValues?.[prop.id];
                                      if (prop.type === 'person' && val) {
                                        const personIds = Array.isArray(val) ? val : [val];
                                        const people = members.filter((m) => personIds.includes(m.id));
                                        return (
                                          <td key={prop.id} className="p-3">
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
                                      return (
                                        <td
                                          key={prop.id}
                                          className="p-3 text-xs text-zinc-600 dark:text-zinc-400 truncate"
                                        >
                                          {val ? String(val) : '-'}
                                        </td>
                                      );
                                    })}

                                    {/* Placements — inline MultiSelect */}
                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                      <MultiSelect
                                        icon={MapPin}
                                        label=""
                                        options={allPlacements.map((p) => ({ value: p, label: p }))}
                                        selected={task.placements}
                                        onChange={(tags) => onUpdateTask({ ...task, placements: tags })}
                                        placeholder="—"
                                        compact
                                      />
                                    </td>
                                    <td className="p-3"></td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td
                                  colSpan={6 + customProperties.length}
                                  className="p-4 text-center text-xs text-zinc-400 italic"
                                >
                                  No tasks in this step
                                </td>
                              </tr>
                            )}
                            {/* Add Task Row */}
                            {!searchQuery && (
                              <tr
                                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                onClick={() => onAddTask({ status: col.id })}
                              >
                                <td
                                  colSpan={6 + customProperties.length}
                                  className="p-2 pl-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs font-medium flex items-center gap-2"
                                >
                                  <Plus size={14} /> Add Task
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
                              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>
                              <p className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase">Change Type</p>
                              {[
                                { type: 'text' as const, icon: Type, label: 'Text' },
                                { type: 'select' as const, icon: ListIcon, label: 'Select' },
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
                              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>
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
                          <h4 className="text-xs font-bold text-zinc-900 dark:text-white mb-2">New Property</h4>
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
                          <button
                            onClick={handleCreateProperty}
                            className="w-full bg-black dark:bg-white text-white dark:text-black py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                          >
                            Create
                          </button>
                        </div>
                      )}
                      {isReorderPropsOpen === col.id && customProperties.length > 1 && (
                        <div
                          className="absolute right-0 top-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-3 w-56 text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <h4 className="text-xs font-bold text-zinc-900 dark:text-white mb-2">Reorder Columns</h4>
                          <div className="space-y-1">
                            {customProperties.map((prop, idx) => (
                              <div
                                key={prop.id}
                                className="flex items-center justify-between px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800/50 text-xs"
                              >
                                <span className="text-zinc-700 dark:text-zinc-300 truncate">{prop.name}</span>
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      if (idx === 0 || !onReorderProperties) return;
                                      const ids = customProperties.map((p) => p.id);
                                      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                                      onReorderProperties(ids);
                                    }}
                                    disabled={idx === 0}
                                    className="p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (idx === customProperties.length - 1 || !onReorderProperties) return;
                                      const ids = customProperties.map((p) => p.id);
                                      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                                      onReorderProperties(ids);
                                    }}
                                    disabled={idx === customProperties.length - 1}
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
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white w-32 text-center">
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
                  className="p-2 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Full Height Grid with Scroll Fix */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-black custom-scrollbar pb-10">
              <div className="grid grid-cols-7 auto-rows-fr border-b border-zinc-200 dark:border-zinc-800 min-h-[500px]">
                {calendarDays.map((dateObj, i) => {
                  const isCurrentMonth = dateObj.type === 'current';
                  const isToday = isCurrentMonth && dateObj.date.toDateString() === new Date().toDateString();
                  const dateStr = dateObj.date.toISOString();

                  if (!isCurrentMonth) {
                    // Render empty placeholder for structure but minimal
                    return (
                      <div
                        key={i}
                        className="bg-zinc-50/20 dark:bg-zinc-900/20 border-b border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
                      ></div>
                    );
                  }

                  const dayTasks = filteredTasks.filter(
                    (t) => new Date(t.dueDate).toDateString() === dateObj.date.toDateString(),
                  );

                  return (
                    <div
                      key={i}
                      className={`flex flex-col min-h-[100px] relative transition-colors border-b border-r border-zinc-200 dark:border-zinc-800 group/cell last:border-r-0 ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/20' : 'bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900/20'}`}
                      onClick={() => onAddTask({ dueDate: dateStr })}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropDate(e, dateStr)}
                    >
                      <div
                        className={`p-1 text-[10px] font-medium text-right ${isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-zinc-400'} group-hover/cell:text-zinc-900 dark:group-hover/cell:text-zinc-100`}
                      >
                        {dateObj.day}
                      </div>
                      <div className="flex-1 p-1 space-y-1">
                        {dayTasks.map((t) => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTaskClick(t);
                            }}
                            draggable
                            onDragStart={(e) => handleDragStart(e, t.id, t.status)}
                            className="group cursor-grab active:cursor-grabbing"
                          >
                            <div
                              className={`text-[9px] px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 border-l-[3px] shadow-sm bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 ${getStatusAccent(t.status)}`}
                            >
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
    </div>
  );
};

export default Workspace;
