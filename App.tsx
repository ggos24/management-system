
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Workspace from './components/Workspace';
import Schedule from './components/Schedule';
import LoginPage from './components/LoginPage';
import { MOCK_TASKS, MOCK_MEMBERS, MOCK_ABSENCES, MOCK_SHIFTS, TEAMS, TEAM_STATUSES, TEAM_CONTENT_TYPES, MOCK_LOGS } from './constants';
import { Task, TaskStatus, Team, User, Member, Absence, Shift, LogEntry, CustomProperty } from './types';
import { Sun, Moon, Bell, Search, User as UserIcon, X, Plus, Menu, Trash2, Edit2, Check, ArrowRight, Eye, EyeOff, FileText, Globe, Video, Instagram, Briefcase, Cpu, Megaphone, Monitor, Smartphone, Zap, Database, Layout, PenTool, Hash, Code, Clock, Calendar, Paperclip, Bold, Italic, List, Link as LinkIcon, ChevronLeft, ChevronRight, ExternalLink, MapPin, ChevronDown, MessageSquare, Send, Wand2, Share2, Copy, CheckSquare, Palette, CheckCircle, ChevronUp, File, Shield, Archive, Type, List as ListIcon, Users } from 'lucide-react';
import { MultiSelect } from './components/MultiSelect';
import { CustomSelect } from './components/CustomSelect';
import { SimpleDatePicker } from './components/SimpleDatePicker';
import { chatWithArchive } from './services/geminiService';

// Icon Helper for Picker
const ICONS = ['FileText', 'Globe', 'Video', 'Instagram', 'Briefcase', 'Cpu', 'Megaphone', 'Monitor', 'Smartphone', 'Zap', 'Database', 'Layout', 'PenTool', 'Hash', 'Code'];

const IconComponent: React.FC<{ name: string, size?: number, className?: string }> = ({ name, size = 16, className }) => {
    switch(name) {
          case 'FileText': return <FileText size={size} className={className} />;
          case 'Video': return <Video size={size} className={className} />;
          case 'Instagram': return <Instagram size={size} className={className} />;
          case 'Briefcase': return <Briefcase size={size} className={className} />;
          case 'Globe': return <Globe size={size} className={className} />;
          case 'Cpu': return <Cpu size={size} className={className} />;
          case 'Megaphone': return <Megaphone size={size} className={className} />;
          case 'Monitor': return <Monitor size={size} className={className} />;
          case 'PenTool': return <PenTool size={size} className={className} />;
          case 'Code': return <Code size={size} className={className} />;
          case 'Smartphone': return <Smartphone size={size} className={className} />;
          case 'Zap': return <Zap size={size} className={className} />;
          case 'Database': return <Database size={size} className={className} />;
          case 'Layout': return <Layout size={size} className={className} />;
          default: return <Hash size={size} className={className} />;
    }
}

// Formatting Toolbar Component
const FormattingToolbar: React.FC<{ onAction: (action: string) => void }> = ({ onAction }) => (
    <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-md">
        <button onClick={() => onAction('h2')} className="px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 text-xs font-bold" title="Heading 2">H2</button>
        <button onClick={() => onAction('h3')} className="px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 text-xs font-bold" title="Heading 3">H3</button>
        <button onClick={() => onAction('bold')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400" title="Bold"><Bold size={14}/></button>
        <button onClick={() => onAction('italic')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400" title="Italic"><Italic size={14}/></button>
        <button onClick={() => onAction('list')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400" title="Bullet List"><List size={14}/></button>
        <button onClick={() => onAction('todo')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400 flex items-center gap-1" title="To-do List">
             <CheckSquare size={14}/> 
        </button>
        <button onClick={() => onAction('link')} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-400" title="Link"><LinkIcon size={14}/></button>
    </div>
);

// Unified Modal Component
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode, actions?: React.ReactNode, headerActions?: React.ReactNode }> = ({ isOpen, onClose, title, children, actions, headerActions }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4">
                     {/* Empty Left Side for Balance or Title if needed in Header */}
                     <div>{title && <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h3>}</div>
                     <div className="flex-1 flex justify-end gap-2 items-center">
                        {headerActions}
                        <button onClick={onClose}><X size={20} className="text-zinc-400 hover:text-black dark:hover:text-white" /></button>
                     </div>
                </div>
                <div className="px-8 pb-8">
                    {children}
                </div>
                {actions && (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 rounded-b-lg">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

// ... (Absence helper functions remain the same) ...
const calculateAbsenceStats = (memberId: string, absences: Absence[]) => {
    let holidayDays = 0;
    let sickDays = 0;
    let businessDays = 0;
    let daysOff = 0;

    absences.filter(a => a.memberId === memberId).forEach(a => {
        const start = new Date(a.startDate);
        const end = new Date(a.endDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
        
        switch(a.type) {
            case 'holiday': holidayDays += days; break;
            case 'sick': sickDays += days; break;
            case 'business_trip': businessDays += days; break;
            case 'day_off': daysOff += days; break;
        }
    });

    return { holidayDays, sickDays, businessDays, daysOff };
};

const AbsenceStatsCard: React.FC<{ stats: ReturnType<typeof calculateAbsenceStats> }> = ({ stats }) => (
    <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">Holidays</p>
            <div className="flex justify-between items-end mt-1">
                <span className="text-xl font-bold text-emerald-900 dark:text-emerald-100">{stats.holidayDays}/24</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{24 - stats.holidayDays} left</span>
            </div>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/40">
            <p className="text-xs font-bold text-red-800 dark:text-red-300 uppercase">Sick Leave</p>
            <p className="text-xl font-bold text-red-900 dark:text-red-100 mt-1">{stats.sickDays} <span className="text-xs font-normal opacity-70">days</span></p>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900/40">
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">Business Trip</p>
            <p className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">{stats.businessDays} <span className="text-xs font-normal opacity-70">days</span></p>
        </div>
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
            <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">Day Off</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stats.daysOff} <span className="text-xs font-normal opacity-70">days</span></p>
        </div>
    </div>
);

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // App State
  const [currentView, setCurrentView] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Data State
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [teams, setTeams] = useState<Team[]>(TEAMS);
  const [absences, setAbsences] = useState<Absence[]>(MOCK_ABSENCES);
  const [shifts, setShifts] = useState<Shift[]>(MOCK_SHIFTS);
  const [members, setMembers] = useState<Member[]>(MOCK_MEMBERS);
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);
  
  // Customizable Statuses, Types, and Properties
  const [teamStatuses, setTeamStatuses] = useState(TEAM_STATUSES);
  const [teamTypes, setTeamTypes] = useState(TEAM_CONTENT_TYPES);
  const [teamProperties, setTeamProperties] = useState<Record<string, CustomProperty[]>>({}); // Store custom properties per team

  // Archive & Permissions State
  const [archivedStatuses, setArchivedStatuses] = useState<Record<string, string[]>>({});
  const [permissions, setPermissions] = useState<Record<string, { canEdit: boolean, canDelete: boolean, canCreate: boolean }>>(() => {
      const perms: any = {};
      MOCK_MEMBERS.forEach(m => {
          perms[m.id] = { canEdit: m.role === 'admin', canDelete: m.role === 'admin', canCreate: true };
      });
      return perms;
  });
  
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Auth State (Mock)
  const [currentUser, setCurrentUser] = useState<User>(MOCK_MEMBERS[0]); // Default Admin

  // Modal States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalData, setTaskModalData] = useState<Partial<Task>>({}); // For both create and edit
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isManageTeamsModalOpen, setIsManageTeamsModalOpen] = useState(false);
  
  // Rich Text Refs
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Team Management State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamIcon, setNewTeamIcon] = useState('Hash');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  
  // Share State
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Settings Tab State
  const [activeSettingsTab, setActiveSettingsTab] = useState('My Profile');

  // Integrations State
  const [integrations, setIntegrations] = useState({ telegram: false });

  // Notifications State
  const [notifications, setNotifications] = useState([
      { id: 1, text: 'New comment on "AI Trends"', time: '2 hours ago' },
      { id: 2, text: 'Task "Q3 Strategy" is overdue', time: '5 hours ago' },
      { id: 3, text: 'Welcome to the team!', time: '1 day ago' }
  ]);

  // Placements State
  const PLACEMENTS_LIST = [
      'YouTube Report', 'YouTube Interview', 'YouTube Shorts', 'YouTube Community',
      'Facebook Post', 'Instagram Post', 'Instagram Reels', 'Instagram Stories', 'Instagram Slider',
      'Twitter Post', 'Website Article', 'Website Stories', 'LinkedIn Post',
      'TikTok Video', 'Telegram Post', 'Threads Post', 'Bluesky Post', 'Reddit Post'
  ];
  const [allPlacements, setAllPlacements] = useState<string[]>(PLACEMENTS_LIST);

  // AI Chat State
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const handleUpdateTask = (updatedTask: Task) => {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  }

  const handleDeleteTask = (taskId: string) => {
      if(confirm('Are you sure you want to delete this task?')) {
          setTasks(prev => prev.filter(t => t.id !== taskId));
          setIsTaskModalOpen(false);
      }
  }

  const handleArchiveStatus = (teamId: string, status: string) => {
      setArchivedStatuses(prev => {
          const currentArchived = prev[teamId] || [];
          if (currentArchived.includes(status)) {
              return { ...prev, [teamId]: currentArchived.filter(s => s !== status) };
          } else {
              return { ...prev, [teamId]: [...currentArchived, status] };
          }
      });
  };

  const handleDuplicateStatus = (teamId: string, status: string, withData: boolean) => {
      const newStatusName = `${status} Copy`;
      let uniqueName = newStatusName;
      let counter = 1;
      const currentStatuses = teamStatuses[teamId] || teamStatuses['default'];
      while (currentStatuses.includes(uniqueName)) {
          uniqueName = `${status} Copy ${counter++}`;
      }

      // Add new status
      setTeamStatuses(prev => ({
          ...prev,
          [teamId]: [...(prev[teamId] || prev['default']), uniqueName]
      }));

      // Clone data if requested
      if (withData) {
          const tasksToClone = tasks.filter(t => t.type === teamId && t.status === status);
          const newTasks = tasksToClone.map(t => ({
              ...t,
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              title: `${t.title} (Copy)`,
              status: uniqueName
          }));
          setTasks(prev => [...prev, ...newTasks]);
      }
  };

  const handleTogglePermission = (userId: string, type: 'canEdit' | 'canDelete' | 'canCreate') => {
      setPermissions(prev => ({
          ...prev,
          [userId]: { ...prev[userId], [type]: !prev[userId]?.[type] }
      }));
  };

  const handleAddProperty = (teamId: string, property: CustomProperty) => {
      setTeamProperties(prev => ({
          ...prev,
          [teamId]: [...(prev[teamId] || []), property]
      }));
  };

  const handleUpdateProperty = (teamId: string, property: CustomProperty) => {
      setTeamProperties(prev => ({
          ...prev,
          [teamId]: prev[teamId].map(p => p.id === property.id ? property : p)
      }));
  };

  const handleDeleteProperty = (teamId: string, propertyId: string) => {
      setTeamProperties(prev => ({
          ...prev,
          [teamId]: prev[teamId].filter(p => p.id !== propertyId)
      }));
  };

  // ... (Other handlers remain same: handleShareTask, handleInviteMember, etc.) ...
  const handleShareTask = (mode: 'view' | 'edit') => {
      if (!taskModalData.id) {
          alert("Please create the task first before sharing.");
          return;
      }
      const url = `https://mediaflow.app/task/${taskModalData.id}?mode=${mode}`;
      navigator.clipboard.writeText(url).then(() => {
          alert(`Link copied to clipboard:\n${url}`);
          setIsShareOpen(false);
      }).catch(() => {
          alert(`Could not copy to clipboard. Link:\n${url}`);
      });
  };

  const handleInviteMember = () => {
      const email = prompt("Enter email address to invite:");
      if (email) {
          const newMember: Member = {
              id: Date.now().toString(),
              name: email.split('@')[0],
              role: 'user',
              jobTitle: 'Invited Member',
              avatar: `https://ui-avatars.com/api/?name=${email}&background=random`,
              teamId: 'editorial',
              status: 'active'
          };
          setMembers([...members, newMember]);
          setPermissions(prev => ({ ...prev, [newMember.id]: { canEdit: false, canDelete: false, canCreate: true } }));
          setLogs(prev => [{
              id: Date.now().toString(),
              action: 'Member Invited',
              details: `Invited ${email} to the workspace`,
              userId: currentUser.id,
              timestamp: new Date().toISOString()
          }, ...prev]);
          alert(`Invitation sent to ${email}`);
      }
  };

  const handleRemoveMember = (id: string) => {
      if (confirm("Are you sure you want to remove this member?")) {
          const memberName = members.find(m => m.id === id)?.name || 'Unknown';
          setMembers(members.filter(m => m.id !== id));
          setLogs(prev => [{
              id: Date.now().toString(),
              action: 'Member Removed',
              details: `Removed ${memberName} from the workspace`,
              userId: currentUser.id,
              timestamp: new Date().toISOString()
          }, ...prev]);
      }
  };

  const handleToggleIntegration = (key: keyof typeof integrations) => {
      const newState = !integrations[key];
      setIntegrations(prev => ({ ...prev, [key]: newState }));
      setLogs(prev => [{
          id: Date.now().toString(),
          action: 'Integration Update',
          details: `${newState ? 'Connected' : 'Disconnected'} ${String(key).charAt(0).toUpperCase() + String(key).slice(1)}`,
          userId: currentUser.id,
          timestamp: new Date().toISOString()
      }, ...prev]);
  };

  const handleMarkNotificationsRead = () => {
      setNotifications([]);
  };

  const handleChangeAvatar = () => {
      const newAvatar = `https://picsum.photos/100/100?random=${Math.floor(Math.random() * 1000)}`;
      const updatedUser = { ...currentUser, avatar: newAvatar };
      setCurrentUser(updatedUser);
      setMembers(members.map(m => m.id === updatedUser.id ? updatedUser : m));
  };

  const openTaskModal = (taskOrPreset?: Partial<Task>) => {
      const defaultType = currentView !== 'dashboard' && currentView !== 'schedule' && currentView !== 'my-workspace' ? currentView : 'editorial';
      
      const statusList = teamStatuses[defaultType] || teamStatuses['default'];
      const defaultStatus = statusList.includes('Pitch') ? 'Pitch' : (statusList[0] || 'To Do');

      const typeList = teamTypes[defaultType] || teamTypes['default'];
      const defaultContentType = typeList[0];

      const initialData: Partial<Task> = {
          title: '', description: '', type: defaultType, 
          status: defaultStatus, priority: 'medium', placements: [], links: [],
          assigneeIds: [currentUser.id], 
          contentInfo: { type: defaultContentType, editorIds: [], designerIds: [], notes: '', files: [] },
          customFieldValues: {},
          ...taskOrPreset
      };
      setTaskModalData(initialData);
      setIsTaskModalOpen(true);
  }

  const handleSaveTask = () => {
      if(!taskModalData.title) return;
      
      const isNew = !taskModalData.id;
      const newTask: Task = {
          id: taskModalData.id || Date.now().toString(),
          title: taskModalData.title!,
          description: taskModalData.description || '',
          type: taskModalData.type || 'editorial',
          status: taskModalData.status || 'Not Started',
          priority: taskModalData.priority || 'medium',
          dueDate: taskModalData.dueDate || new Date().toISOString(),
          placements: taskModalData.placements || [],
          assigneeIds: taskModalData.assigneeIds || [],
          links: taskModalData.links || [],
          contentInfo: taskModalData.contentInfo || { type: 'Editorial', editorIds: [], designerIds: [] },
          customFieldValues: taskModalData.customFieldValues || {}
      };

      if (isNew) {
          setTasks([...tasks, newTask]);
      } else {
          setTasks(prev => prev.map(t => t.id === newTask.id ? newTask : t));
      }
      setIsTaskModalOpen(false);
  };
  
  // ... (Link and Text handlers remain same) ...
  const handleAddEmptyLink = () => {
      setTaskModalData({
          ...taskModalData,
          links: [...(taskModalData.links || []), { title: '', url: '' }]
      });
  };
  
  const handleUpdateLink = (idx: number, field: 'title' | 'url', value: string) => {
      const newLinks = [...(taskModalData.links || [])];
      newLinks[idx] = { ...newLinks[idx], [field]: value };
      setTaskModalData({ ...taskModalData, links: newLinks });
  };

  const handleRemoveLink = (idx: number) => {
      const newLinks = [...(taskModalData.links || [])];
      newLinks.splice(idx, 1);
      setTaskModalData({...taskModalData, links: newLinks});
  };

  const applyMarkdown = (field: 'description' | 'notes', action: string) => {
      const inputRef = field === 'description' ? descriptionRef : notesRef;
      if (!inputRef.current) return;

      const textarea = inputRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selectedText = text.substring(start, end);
      
      let replacement = '';
      let cursorOffset = 0;

      switch(action) {
          case 'h2': replacement = `## ${selectedText || 'Heading 2'}`; cursorOffset = selectedText ? 0 : 11; break;
          case 'h3': replacement = `### ${selectedText || 'Heading 3'}`; cursorOffset = selectedText ? 0 : 12; break;
          case 'bold': replacement = `**${selectedText || 'bold text'}**`; cursorOffset = selectedText ? 0 : 11; break;
          case 'italic': replacement = `*${selectedText || 'italic text'}*`; cursorOffset = selectedText ? 0 : 13; break;
          case 'list': replacement = `\n- ${selectedText || 'List item'}`; cursorOffset = selectedText ? 0 : 12; break;
          case 'todo': replacement = `\n- [ ] ${selectedText || 'To-do item'}`; cursorOffset = selectedText ? 0 : 16; break;
          case 'link': replacement = `[${selectedText || 'Link text'}](url)`; cursorOffset = selectedText ? 5 : 14; break;
          default: replacement = selectedText;
      }

      const newText = text.substring(0, start) + replacement + text.substring(end);
      
      // Update State
      setTaskModalData(prev => {
          if (field === 'description') return { ...prev, description: newText };
          return { ...prev, contentInfo: { ...prev.contentInfo!, notes: newText } };
      });

      // Restore Focus and Cursor (setTimeout to allow react render)
      setTimeout(() => {
          if(inputRef.current) {
              inputRef.current.focus();
              inputRef.current.setSelectionRange(start + replacement.length - cursorOffset, start + replacement.length);
          }
      }, 0);
  };

  // Schedule Management Handlers
  const handleUpdateAbsence = (absence: Absence) => {
      setAbsences(prev => {
          const exists = prev.find(a => a.id === absence.id);
          if (exists) {
              return prev.map(a => a.id === absence.id ? absence : a);
          }
          return [...prev, absence];
      });
  };

  const handleDeleteAbsence = (id: string) => {
      setAbsences(prev => prev.filter(a => a.id !== id));
  };

  const handleUpdateShift = (shift: Shift) => {
      setShifts(prev => {
           const exists = prev.find(s => s.id === shift.id);
           if (exists) {
               return prev.map(s => s.id === shift.id ? shift : s);
           }
           return [...prev, shift];
      });
  };

  const handleDeleteShift = (id: string) => {
      setShifts(prev => prev.filter(s => s.id !== id));
  };

  // Team Management Handlers
  const handleAddTeam = () => {
      if(!newTeamName) return;
      const newId = newTeamName.toLowerCase().replace(/\s+/g, '-');
      const newTeam: Team = {
          id: newId,
          name: newTeamName,
          icon: newTeamIcon,
          scheduleType: 'shift-based',
          hidden: false,
          archived: false
      };
      setTeams([...teams, newTeam]);
      // Initialize default statuses and types for new team
      setTeamStatuses(prev => ({ ...prev, [newId]: TEAM_STATUSES['default'] }));
      setTeamTypes(prev => ({ ...prev, [newId]: TEAM_CONTENT_TYPES['default'] }));
      
      setNewTeamName('');
      setNewTeamIcon('Hash');
  };

  const handleDeleteTeam = (id: string) => {
      if (currentUser.role !== 'admin') {
          alert("Only admins can delete workspaces.");
          return;
      }
      setTeamToDelete(id);
      setDeleteConfirmationInput('');
  };
  
  const handleArchiveTeam = (id: string) => {
      setTeams(teams.map(t => t.id === id ? { ...t, archived: !t.archived } : t));
  };

  const confirmDeleteTeam = () => {
      if (teamToDelete && deleteConfirmationInput === '/iwanttodelete') {
          setTeams(teams.filter(t => t.id !== teamToDelete));
          setTeamToDelete(null);
          setDeleteConfirmationInput('');
      }
  };

  const handleSaveTeamEdit = (id: string, newName: string, newIcon: string) => {
      setTeams(teams.map(t => t.id === id ? { ...t, name: newName, icon: newIcon } : t));
      setEditingTeamId(null);
  };
  
  const toggleTeamVisibility = (id: string) => {
      setTeams(teams.map(t => t.id === id ? { ...t, hidden: !t.hidden } : t));
  };

  // Team Configuration Handlers
  const handleAddStatus = (teamId: string, status: string) => {
      if (!status) return;
      setTeamStatuses(prev => ({
          ...prev,
          [teamId]: [...(prev[teamId] || []), status]
      }));
  };

  const handleReorderStatuses = (teamId: string, newStatuses: string[]) => {
      setTeamStatuses(prev => ({
          ...prev,
          [teamId]: newStatuses
      }));
  };

  const handleDeleteStatus = (teamId: string, status: string) => {
      setTeamStatuses(prev => ({
          ...prev,
          [teamId]: prev[teamId].filter(s => s !== status)
      }));
  };

  const handleAddType = (teamId: string, type: string) => {
      if (!type) return;
      setTeamTypes(prev => ({
          ...prev,
          [teamId]: [...(prev[teamId] || []), type]
      }));
  };

  const handleDeleteType = (teamId: string, type: string) => {
      setTeamTypes(prev => ({
          ...prev,
          [teamId]: prev[teamId].filter(t => t !== type)
      }));
  };

  // Team Reordering Handler
  const handleReorderTeams = (draggedId: string, targetId: string) => {
      const draggedIndex = teams.findIndex(t => t.id === draggedId);
      const targetIndex = teams.findIndex(t => t.id === targetId);
      if(draggedIndex === -1 || targetIndex === -1) return;
      
      const newTeams = [...teams];
      const [reorderedItem] = newTeams.splice(draggedIndex, 1);
      newTeams.splice(targetIndex, 0, reorderedItem);
      setTeams(newTeams);
  };

  const handleLogout = () => {
      setIsLogoutModalOpen(false);
      setIsAuthenticated(false);
      // Reset view
      setCurrentView('dashboard');
  };

  // AI Chat Logic
  const handleAiChatSubmit = async () => {
      if(!aiChatInput.trim()) return;
      const msg = aiChatInput;
      setAiChatMessages([...aiChatMessages, {role: 'user', text: msg}]);
      setAiChatInput('');
      setAiChatLoading(true);

      const response = await chatWithArchive(msg, tasks);
      setAiChatMessages(prev => [...prev, {role: 'ai', text: response || 'I could not process that request.'}]);
      setAiChatLoading(false);
  };

  useEffect(() => {
      if(aiChatEndRef.current) {
          aiChatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [aiChatMessages]);
  
  const renderSettingsContent = () => {
      switch(activeSettingsTab) {
          case 'My Profile':
              const myAbsenceStats = calculateAbsenceStats(currentUser.id, absences);
              return (
                  <div className="space-y-6">
                      <div className="flex items-center gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
                          <img src={currentUser.avatar} alt="" className="w-20 h-20 rounded-full bg-zinc-100 object-cover" />
                          <div>
                              <div className="flex items-center gap-3">
                                  <h3 className="text-lg font-bold">{currentUser.name}</h3>
                                  <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider text-zinc-500">{currentUser.role}</span>
                              </div>
                              <p className="text-zinc-500 text-sm">{currentUser.jobTitle}</p>
                              <button onClick={handleChangeAvatar} className="text-sm text-blue-600 hover:underline mt-2">Change Avatar</button>
                          </div>
                      </div>
                      
                      <div className="space-y-2">
                          <h4 className="text-xs font-bold text-zinc-500 uppercase">My Absences</h4>
                          <AbsenceStatsCard stats={myAbsenceStats} />
                      </div>
                  </div>
              );
          case 'Permissions':
              return (
                  <div className="space-y-4">
                      {currentUser.role !== 'admin' && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm text-yellow-800 dark:text-yellow-200">
                              Only administrators can modify permissions.
                          </div>
                      )}
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                                  <tr>
                                      <th className="p-3 font-medium text-zinc-500">Member</th>
                                      <th className="p-3 font-medium text-zinc-500 text-center">Can Create</th>
                                      <th className="p-3 font-medium text-zinc-500 text-center">Can Edit</th>
                                      <th className="p-3 font-medium text-zinc-500 text-center">Can Delete</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                  {members.map(m => (
                                      <tr key={m.id}>
                                          <td className="p-3 flex items-center gap-2">
                                              <img src={m.avatar} className="w-6 h-6 rounded-full grayscale" />
                                              <span className="font-medium">{m.name}</span>
                                          </td>
                                          <td className="p-3 text-center">
                                              <input 
                                                type="checkbox" 
                                                checked={permissions[m.id]?.canCreate ?? true} 
                                                onChange={() => handleTogglePermission(m.id, 'canCreate')}
                                                disabled={currentUser.role !== 'admin'}
                                              />
                                          </td>
                                          <td className="p-3 text-center">
                                              <input 
                                                type="checkbox" 
                                                checked={permissions[m.id]?.canEdit ?? (m.role === 'admin')} 
                                                onChange={() => handleTogglePermission(m.id, 'canEdit')}
                                                disabled={currentUser.role !== 'admin'}
                                              />
                                          </td>
                                          <td className="p-3 text-center">
                                              <input 
                                                type="checkbox" 
                                                checked={permissions[m.id]?.canDelete ?? (m.role === 'admin')} 
                                                onChange={() => handleTogglePermission(m.id, 'canDelete')}
                                                disabled={currentUser.role !== 'admin'}
                                              />
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              );
          case 'Notifications':
              return (
                  <div className="space-y-6">
                      <div className="space-y-4">
                          <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Email Notifications</span>
                              <input type="checkbox" className="toggle" defaultChecked />
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Web Notifications</span>
                              <input type="checkbox" className="toggle" defaultChecked />
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Telegram Notifications</span>
                              <input type="checkbox" className="toggle" defaultChecked />
                          </div>
                      </div>
                  </div>
              );
          case 'Team Members':
              return (
                  <div className="space-y-2">
                      {members.map(m => (
                          <div key={m.id} className="flex items-center justify-between p-2 border border-zinc-100 dark:border-zinc-800 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                              <div className="flex items-center gap-3">
                                  <img src={m.avatar} className="w-8 h-8 rounded-full object-cover grayscale" />
                                  <div>
                                      <p className="text-sm font-medium">{m.name}</p>
                                      <p className="text-xs text-zinc-500">{m.jobTitle} • {m.role}</p>
                                  </div>
                              </div>
                              {currentUser.role === 'admin' && (
                                <button onClick={() => handleRemoveMember(m.id)} className="text-xs text-zinc-400 hover:text-red-500">Remove</button>
                              )}
                          </div>
                      ))}
                      {currentUser.role === 'admin' && (
                        <button onClick={handleInviteMember} className="w-full py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mt-2">+ Invite Member</button>
                      )}
                  </div>
              );
          case 'Integrations':
             return (
                 <div className="space-y-4">
                     <div className="p-3 border border-zinc-200 dark:border-zinc-700 rounded flex justify-between items-center">
                         <div className="flex items-center gap-2"><Send size={16} className="text-[#0088cc]"/> <span>Telegram</span></div>
                         <button 
                            onClick={() => handleToggleIntegration('telegram')} 
                            disabled={currentUser.role !== 'admin'}
                            className={`text-xs px-2 py-1 rounded transition-colors ${integrations.telegram ? 'text-green-600 font-medium bg-green-50 dark:bg-green-900/20' : 'bg-zinc-900 text-white'} ${currentUser.role !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                             {integrations.telegram ? 'Connected' : 'Connect'}
                         </button>
                     </div>
                 </div>
             );
          case 'Logs History':
             return (
                 <div className="space-y-4 h-[400px] overflow-hidden flex flex-col">
                     <h4 className="text-xs font-bold text-zinc-500 uppercase flex-shrink-0">Activity Logs</h4>
                     <div className="flex-1 overflow-y-auto custom-scrollbar border border-zinc-200 dark:border-zinc-700 rounded-lg">
                         {logs.map(log => {
                             const user = members.find(m => m.id === log.userId);
                             return (
                                 <div key={log.id} className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                     <div className="flex items-center gap-2 mb-1">
                                         <span className="text-xs font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{log.action}</span>
                                         <span className="text-[10px] text-zinc-400">{new Date(log.timestamp).toLocaleString()}</span>
                                     </div>
                                     <p className="text-sm text-zinc-800 dark:text-zinc-200">{log.details}</p>
                                     <div className="flex items-center gap-1.5 mt-2">
                                         <img src={user?.avatar} className="w-4 h-4 rounded-full grayscale" />
                                         <span className="text-xs text-zinc-500">{user?.name || 'Unknown User'}</span>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
             );
          default: return null;
      }
  };

  const isTeamView = useMemo(() => {
      return teams.some(t => t.id === currentView);
  }, [currentView, teams]);

  const renderContent = () => {
    if (currentView === 'dashboard') {
        return <Dashboard tasks={tasks} members={members} absences={absences} teams={teams} />;
    } else if (currentView === 'schedule') {
        return (
            <Schedule 
                members={members} 
                absences={absences} 
                shifts={shifts}
                teams={teams}
                userRole={currentUser.role}
                onUpdateAbsence={handleUpdateAbsence}
                onDeleteAbsence={handleDeleteAbsence}
                onUpdateShift={handleUpdateShift}
                onDeleteShift={handleDeleteShift}
            />
        );
    } else if (currentView === 'my-workspace') {
         return (
             <Workspace 
                tasks={tasks}
                teamFilter="my-work"
                teamName="My Workspace"
                members={members}
                currentUserId={currentUser.id}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onAddTask={openTaskModal}
                searchQuery={searchQuery}
                onTaskClick={openTaskModal}
                onOpenAiChat={() => setIsAiChatOpen(true)}
                onUpdateTask={handleUpdateTask}
                teamStatuses={teamStatuses}
                onUpdateTeamStatuses={handleReorderStatuses}
                archivedStatuses={archivedStatuses}
                onArchiveStatus={handleArchiveStatus}
                onDuplicateStatus={handleDuplicateStatus}
                customProperties={teamProperties['my-work'] || []}
                onAddProperty={(prop) => handleAddProperty('my-work', prop)}
                onUpdateProperty={(prop) => handleUpdateProperty('my-work', prop)}
                onDeleteProperty={(id) => handleDeleteProperty('my-work', id)}
                userRole={currentUser.role}
            />
         )
    } else {
        const team = teams.find(t => t.id === currentView);
        if (team) {
            return (
                <Workspace 
                    tasks={tasks} 
                    teamFilter={team.id}
                    teamName={team.name}
                    members={members}
                    currentUserId={currentUser.id}
                    onUpdateTaskStatus={handleUpdateTaskStatus}
                    onAddTask={openTaskModal}
                    searchQuery={searchQuery}
                    onTaskClick={openTaskModal}
                    onOpenAiChat={() => setIsAiChatOpen(true)}
                    onUpdateTask={handleUpdateTask}
                    teamStatuses={teamStatuses}
                    onUpdateTeamStatuses={handleReorderStatuses}
                    archivedStatuses={archivedStatuses}
                    onArchiveStatus={handleArchiveStatus}
                    onDuplicateStatus={handleDuplicateStatus}
                    customProperties={teamProperties[team.id] || []}
                    onAddProperty={(prop) => handleAddProperty(team.id, prop)}
                    onUpdateProperty={(prop) => handleUpdateProperty(team.id, prop)}
                    onDeleteProperty={(id) => handleDeleteProperty(team.id, id)}
                    userRole={currentUser.role}
                />
            );
        }
    }
    return <div>View not found</div>;
  };

  const getAuthorLabel = () => {
      return taskModalData.type === 'management' ? 'Executive' : 'Author';
  };
  
  const getEditorLabel = () => {
       return taskModalData.type === 'management' ? 'Manager' : 'Editor';
  };

  if (!isAuthenticated) {
      return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className={`flex h-screen overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 ${isDarkMode ? 'dark' : ''}`}>
      <Sidebar 
        currentView={currentView} 
        onChangeView={(view) => { setCurrentView(view); setMobileSidebarOpen(false); }}
        onLogout={() => setIsLogoutModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onManageTeams={() => setIsManageTeamsModalOpen(true)}
        onReorderTeams={handleReorderTeams}
        teams={teams}
        userRole={currentUser.role}
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
        isMobileOpen={mobileSidebarOpen}
        setIsMobileOpen={setMobileSidebarOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Top Navigation */}
        <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-white dark:bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
           <div className="flex items-center gap-3">
               <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                   <Menu size={20} />
               </button>
               {(isTeamView || currentView === 'my-workspace') && (
                   <div className="relative hidden md:block group">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                       <input 
                            type="text" 
                            placeholder="Search..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 border-none rounded-md text-sm w-64 focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 outline-none transition-all" 
                       />
                   </div>
               )}
           </div>

           <div className="flex items-center gap-2">
               <button onClick={toggleTheme} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors">
                   {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
               </button>
               {/* ... Notification Bell ... */}
               <div className="relative">
                   <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors relative">
                       <Bell size={18} />
                       {notifications.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>}
                   </button>
                   {isNotificationsOpen && (
                       <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-100">
                           <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                               <h3 className="text-sm font-bold">Notifications</h3>
                               <button onClick={() => setIsNotificationsOpen(false)}><X size={14} /></button>
                           </div>
                           <div className="max-h-80 overflow-y-auto">
                               {notifications.map(n => (
                                   <div key={n.id} className="p-3 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-sm">
                                       <p className="font-medium text-zinc-800 dark:text-zinc-200"><span className="font-bold">System:</span> {n.text}</p>
                                       <span className="text-xs text-zinc-400">{n.time}</span>
                                   </div>
                               ))}
                               {notifications.length === 0 && <p className="p-4 text-xs text-zinc-400 text-center">No new notifications</p>}
                           </div>
                           <div className="p-2 text-center border-t border-zinc-100 dark:border-zinc-800">
                               <button onClick={handleMarkNotificationsRead} className="text-xs font-medium hover:underline text-zinc-500">Mark all as read</button>
                           </div>
                       </div>
                   )}
               </div>
               <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800 mx-2"></div>
               <button onClick={() => setIsSettingsModalOpen(true)} className="flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 pr-3 pl-1 py-1 rounded-full transition-colors">
                   <img src={currentUser.avatar} alt="User" className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-700" />
                   <div className="text-left hidden md:block">
                       <p className="text-xs font-bold leading-none">{currentUser.name}</p>
                       <p className="text-[10px] text-zinc-500 leading-none mt-0.5 uppercase tracking-wide">{currentUser.role}</p>
                   </div>
               </button>
           </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 overflow-hidden relative">
            {renderContent()}
        </main>
      </div>

      {/* Task Modal */}
      <Modal 
        isOpen={isTaskModalOpen} 
        onClose={() => setIsTaskModalOpen(false)}
        title={""} 
        headerActions={
            <div className="flex gap-2 mr-2 relative">
                 <button 
                    onClick={() => handleDeleteTask(taskModalData.id!)}
                    className={`p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors ${!taskModalData.id ? 'hidden' : ''}`}
                    title="Delete Task"
                 >
                     <Trash2 size={18}/>
                 </button>
                 <button 
                    onClick={() => setIsShareOpen(!isShareOpen)}
                    className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors" 
                    title="Share"
                 >
                     <Share2 size={18}/>
                 </button>
                 {isShareOpen && (
                     <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-xl z-50 p-1 flex flex-col">
                         <button onClick={() => handleShareTask('view')} className="text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-700 dark:text-zinc-300">
                             Share for View
                         </button>
                         <button onClick={() => handleShareTask('edit')} className="text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-700 dark:text-zinc-300">
                             Share for Edit
                         </button>
                     </div>
                 )}
            </div>
        }
        actions={
            <>
                <button onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300">Cancel</button>
                <button onClick={handleSaveTask} className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-md hover:opacity-90 transition-opacity">
                    {taskModalData.id ? 'Save Changes' : 'Create Task'}
                </button>
            </>
        }
      >
          {/* ... (Task Fields) ... */}
          <div className="flex flex-col gap-6">
              <input 
                type="text" 
                placeholder="Task Title" 
                value={taskModalData.title || ''}
                onChange={(e) => setTaskModalData({ ...taskModalData, title: e.target.value })}
                className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder-zinc-300 dark:placeholder-zinc-700"
                autoFocus
              />

              <div className="space-y-2">
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800/50 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
                      <FormattingToolbar onAction={(action) => applyMarkdown('description', action)} />
                      <textarea 
                        ref={descriptionRef}
                        className="w-full p-3 bg-transparent border-none outline-none text-sm min-h-[120px] resize-y"
                        placeholder="Description..."
                        value={taskModalData.description || ''}
                        onChange={(e) => setTaskModalData({...taskModalData, description: e.target.value})}
                      />
                  </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                       <CustomSelect 
                            icon={CheckCircle}
                            label="Status"
                            options={teamStatuses[taskModalData.type || 'default'] || teamStatuses['default']}
                            value={taskModalData.status || ''}
                            onChange={(val) => setTaskModalData({...taskModalData, status: val})}
                            onAdd={(val) => {
                                handleAddStatus(taskModalData.type || 'default', val);
                                setTaskModalData({...taskModalData, status: val});
                            }}
                        />
                        <CustomSelect 
                            icon={Layout}
                            label="Content Type"
                            options={teamTypes[taskModalData.type || 'default'] || teamTypes['default']}
                            value={taskModalData.contentInfo?.type || ''}
                            onChange={(val) => setTaskModalData({...taskModalData, contentInfo: { ...taskModalData.contentInfo!, type: val }})}
                            onAdd={(val) => {
                                handleAddType(taskModalData.type || 'default', val);
                                setTaskModalData({...taskModalData, contentInfo: { ...taskModalData.contentInfo!, type: val }});
                            }}
                        />
                        <MultiSelect 
                            icon={UserIcon}
                            label={getAuthorLabel()}
                            options={members.map(m => ({value: m.id, label: m.name}))}
                            selected={taskModalData.assigneeIds || []}
                            onChange={(ids) => setTaskModalData({...taskModalData, assigneeIds: ids})}
                            placeholder={`Select ${getAuthorLabel()}...`}
                        />
                        <MultiSelect 
                            icon={Eye}
                            label={getEditorLabel()}
                            options={members.map(m => ({value: m.id, label: m.name}))}
                            selected={taskModalData.contentInfo?.editorIds || []}
                            onChange={(ids) => setTaskModalData({...taskModalData, contentInfo: {...taskModalData.contentInfo!, editorIds: ids}})}
                            placeholder={`Select ${getEditorLabel()}...`}
                        />
                        {taskModalData.type === 'social' && (
                           <MultiSelect 
                                icon={Palette}
                                label="Designer"
                                options={members.map(m => ({value: m.id, label: m.name}))}
                                selected={taskModalData.contentInfo?.designerIds || []}
                                onChange={(ids) => setTaskModalData({...taskModalData, contentInfo: {...taskModalData.contentInfo!, designerIds: ids}})}
                                placeholder="Select Designer..."
                           />
                        )}
                        <CustomSelect 
                            icon={Zap}
                            label="Priority"
                            options={['low', 'medium', 'high']}
                            value={taskModalData.priority || 'medium'}
                            onChange={(val) => setTaskModalData({...taskModalData, priority: val as any})}
                            renderValue={(v) => <span className={`capitalize ${v === 'high' ? 'text-red-500 font-bold' : v === 'medium' ? 'text-yellow-500' : 'text-zinc-500'}`}>{v}</span>}
                        />
                        <div className="space-y-1">
                             <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5"><Calendar size={12}/> Due Date</label>
                             <SimpleDatePicker 
                                value={taskModalData.dueDate ? taskModalData.dueDate.split('T')[0] : ''} 
                                onChange={(date) => setTaskModalData({...taskModalData, dueDate: new Date(date).toISOString()})}
                                placeholder="Set due date"
                             />
                        </div>
                        <div className="md:col-span-2">
                             <MultiSelect 
                                  icon={Globe}
                                  label="Placements"
                                  options={allPlacements.map(p => ({value: p, label: p}))}
                                  selected={taskModalData.placements || []}
                                  onChange={(tags) => setTaskModalData({...taskModalData, placements: tags})}
                                  onAdd={(newTag) => { setAllPlacements([...allPlacements, newTag]); setTaskModalData({...taskModalData, placements: [...(taskModalData.placements || []), newTag] }) }}
                                  placeholder="Add tags..."
                             />
                        </div>
                        
                        {/* Custom Properties Inputs */}
                        {(teamProperties[taskModalData.type || 'default'] || []).map(prop => (
                            <div key={prop.id} className="space-y-1">
                                <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5 capitalize">{prop.name}</label>
                                {prop.type === 'text' && (
                                    <input 
                                        className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-sm"
                                        value={taskModalData.customFieldValues?.[prop.id] || ''}
                                        onChange={(e) => setTaskModalData({ ...taskModalData, customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: e.target.value } })}
                                    />
                                )}
                                {prop.type === 'date' && (
                                    <SimpleDatePicker 
                                        value={taskModalData.customFieldValues?.[prop.id] || ''}
                                        onChange={(date) => setTaskModalData({ ...taskModalData, customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: date } })}
                                        placeholder="Select Date"
                                    />
                                )}
                                {prop.type === 'select' && (
                                    <CustomSelect 
                                        options={prop.options?.map(o => ({ value: o, label: o })) || []}
                                        value={taskModalData.customFieldValues?.[prop.id] || ''}
                                        onChange={(val) => setTaskModalData({ ...taskModalData, customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: val } })}
                                        placeholder="Select..."
                                        onAdd={(val) => {
                                            // Handle adding options
                                            handleUpdateProperty(taskModalData.type || 'default', { ...prop, options: [...(prop.options || []), val] });
                                            setTaskModalData({ ...taskModalData, customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: val } })
                                        }}
                                    />
                                )}
                                {prop.type === 'person' && (
                                    <CustomSelect 
                                        options={members.map(m => ({value: m.id, label: m.name}))}
                                        value={taskModalData.customFieldValues?.[prop.id] || ''}
                                        onChange={(val) => setTaskModalData({ ...taskModalData, customFieldValues: { ...taskModalData.customFieldValues, [prop.id]: val } })}
                                        placeholder="Select person..."
                                    />
                                )}
                            </div>
                        ))}
                  </div>
              </div>

              <div className="space-y-2">
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800/50 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
                          <span className="text-xs font-bold text-zinc-500 uppercase">Notes</span>
                      </div>
                      <FormattingToolbar onAction={(action) => applyMarkdown('notes', action)} />
                      <textarea 
                        ref={notesRef}
                        className="w-full p-3 bg-transparent border-none outline-none text-sm min-h-[100px] resize-y"
                        placeholder="Add notes..."
                        value={taskModalData.contentInfo?.notes || ''}
                        onChange={(e) => setTaskModalData({...taskModalData, contentInfo: { ...taskModalData.contentInfo!, notes: e.target.value }})}
                      />
                  </div>
              </div>

              <div className="space-y-2">
                   <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2"><LinkIcon size={12}/> Links Attachments</label>
                   {taskModalData.links?.map((link, idx) => (
                       <div key={idx} className="flex gap-2 mb-2">
                           <input 
                                className="flex-1 p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs outline-none"
                                placeholder="Title (e.g. Reference)"
                                value={link.title}
                                onChange={(e) => handleUpdateLink(idx, 'title', e.target.value)}
                           />
                           <input 
                                className="flex-[2] p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs outline-none font-mono text-blue-600 dark:text-blue-400"
                                placeholder="URL (https://...)"
                                value={link.url}
                                onChange={(e) => handleUpdateLink(idx, 'url', e.target.value)}
                           />
                           <button onClick={() => handleRemoveLink(idx)} className="p-2 text-zinc-400 hover:text-red-500"><X size={14}/></button>
                       </div>
                   ))}
                   <button onClick={handleAddEmptyLink} className="text-xs flex items-center gap-1 text-blue-600 hover:underline font-medium"><Plus size={12}/> Add Link</button>
              </div>
          </div>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Settings"
      >
          <div className="flex gap-6 min-h-[400px]">
              <div className="w-48 border-r border-zinc-100 dark:border-zinc-800 pr-4 space-y-1">
                  {['My Profile', 'Permissions', 'Notifications', 'Team Members', 'Integrations', 'Logs History'].map(tab => (
                      <button 
                        key={tab}
                        onClick={() => setActiveSettingsTab(tab)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeSettingsTab === tab ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                      >
                          {tab}
                      </button>
                  ))}
              </div>
              <div className="flex-1">
                  {renderSettingsContent()}
              </div>
          </div>
      </Modal>

      {/* Manage Teams Modal */}
      <Modal
          isOpen={isManageTeamsModalOpen}
          onClose={() => setIsManageTeamsModalOpen(false)}
          title="Manage Workspaces"
      >
          {/* ... existing Manage Teams content ... */}
          <div className="space-y-6 min-h-[400px] flex flex-col">
              <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-4">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase">Create New Workspace</h4>
                  <div className="flex gap-2">
                      <div className="relative">
                           <button 
                                onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                                className="h-10 w-10 flex items-center justify-center border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                           >
                               <IconComponent name={newTeamIcon} />
                           </button>
                           {isIconPickerOpen && (
                               <div className="absolute top-12 left-0 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 p-2 grid grid-cols-6 gap-2">
                                   {ICONS.map(icon => (
                                       <button 
                                            key={icon} 
                                            onClick={() => { setNewTeamIcon(icon); setIsIconPickerOpen(false); }}
                                            className={`p-1.5 rounded flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 ${newTeamIcon === icon ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white' : 'text-zinc-500'}`}
                                       >
                                           <IconComponent name={icon} size={16} />
                                       </button>
                                   ))}
                               </div>
                           )}
                      </div>
                      <input 
                          type="text" 
                          placeholder="Workspace Name (e.g. Design Team)" 
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          className="flex-1 p-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-sm outline-none focus:border-black dark:focus:border-white"
                      />
                      <button onClick={handleAddTeam} className="bg-black dark:bg-white text-white dark:text-black px-4 rounded text-sm font-bold hover:opacity-90">Create</button>
                  </div>
              </div>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

              <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase">Existing Workspaces</h4>
                  <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      {teams.map(team => (
                          <div key={team.id} className={`border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 group ${team.archived ? 'opacity-60 grayscale' : ''}`}>
                              <div className="flex items-center justify-between p-3">
                                  <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">
                                          <IconComponent name={team.icon} size={16} />
                                      </div>
                                      {editingTeamId === team.id ? (
                                          <input 
                                              autoFocus
                                              defaultValue={team.name}
                                              className="border-b border-black dark:border-white bg-transparent outline-none text-sm font-bold w-48"
                                              onBlur={(e) => handleSaveTeamEdit(team.id, e.target.value, team.icon)}
                                              onKeyDown={(e) => e.key === 'Enter' && handleSaveTeamEdit(team.id, e.currentTarget.value, team.icon)}
                                          />
                                      ) : (
                                          <p className="text-sm font-bold">{team.name} {team.archived && <span className="text-[10px] font-normal text-zinc-400 uppercase ml-2">(Archived)</span>}</p>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <button onClick={() => toggleTeamVisibility(team.id)} className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white" title={team.hidden ? "Show" : "Hide"}>
                                          {team.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                      </button>
                                      <button onClick={() => setEditingTeamId(team.id)} className="p-1.5 text-zinc-400 hover:text-blue-500" title="Rename"><Edit2 size={14} /></button>
                                      <button onClick={() => handleArchiveTeam(team.id)} className={`p-1.5 text-zinc-400 hover:text-yellow-600 ${team.archived ? 'text-yellow-600' : ''}`} title={team.archived ? "Unarchive" : "Archive"}>
                                          <Archive size={14} />
                                      </button>
                                      {/* Only allow deletion for non-management teams */}
                                      {team.id !== 'management' && (
                                          <button onClick={() => handleDeleteTeam(team.id)} className="p-1.5 text-zinc-400 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                                      )}
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              
              {teamToDelete && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900 space-y-2 animate-in fade-in slide-in-from-top-2">
                      <p className="text-sm text-red-700 dark:text-red-300 font-bold">Are you sure you want to delete this workspace?</p>
                      <p className="text-xs text-red-600 dark:text-red-400">Type <span className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">/iwanttodelete</span> to confirm.</p>
                      <div className="flex gap-2 mt-2">
                          <input 
                                value={deleteConfirmationInput}
                                onChange={e => setDeleteConfirmationInput(e.target.value)}
                                className="flex-1 p-2 border border-red-300 dark:border-red-800 rounded bg-white dark:bg-zinc-900 text-sm outline-none"
                          />
                          <button 
                            onClick={confirmDeleteTeam} 
                            disabled={deleteConfirmationInput !== '/iwanttodelete'}
                            className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold disabled:opacity-50 hover:bg-red-700"
                          >
                              Confirm
                          </button>
                          <button onClick={() => setTeamToDelete(null)} className="text-zinc-500 text-sm hover:underline px-2">Cancel</button>
                      </div>
                  </div>
              )}
          </div>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="Confirm Logout"
        actions={
            <>
                <button onClick={() => setIsLogoutModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300">Cancel</button>
                <button onClick={handleLogout} className="px-6 py-2 bg-red-600 text-white text-sm font-bold rounded-md hover:bg-red-700 transition-colors">
                    Logout
                </button>
            </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Are you sure you want to log out of your account?</p>
      </Modal>

      {/* Persistent AI Chat Widget */}
      <div className={`fixed bottom-6 right-6 z-40 flex flex-col items-end transition-all duration-300 ${isAiChatOpen ? 'w-[400px]' : 'w-0 overflow-hidden'}`}>
          {isAiChatOpen && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl mb-4 w-full h-[500px] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-200">
                  <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="font-bold text-sm">AI Assist</span>
                      </div>
                      <button onClick={() => setIsAiChatOpen(false)}><X size={16} className="text-zinc-400 hover:text-black dark:hover:text-white" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-zinc-950">
                      {aiChatMessages.length === 0 && (
                          <div className="text-center text-zinc-400 text-sm mt-20">
                              <Wand2 size={40} className="mx-auto mb-3 opacity-20" />
                              <p>Ask me anything about your tasks, schedule, or content ideas.</p>
                          </div>
                      )}
                      {aiChatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-none'}`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                      {aiChatLoading && (
                          <div className="flex justify-start">
                              <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-2xl rounded-bl-none text-xs text-zinc-500 italic flex items-center gap-1">
                                  <span>Thinking</span><span className="animate-bounce">.</span><span className="animate-bounce delay-75">.</span><span className="animate-bounce delay-150">.</span>
                              </div>
                          </div>
                      )}
                      <div ref={aiChatEndRef}></div>
                  </div>
                  <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <div className="relative">
                          <input 
                              value={aiChatInput}
                              onChange={(e) => setAiChatInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAiChatSubmit()}
                              placeholder="Type a message..."
                              className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                          />
                          <button onClick={handleAiChatSubmit} className="absolute right-1.5 top-1.5 p-1.5 bg-black dark:bg-white text-white dark:text-black rounded-full hover:opacity-80 transition-opacity">
                              <ArrowRight size={14} />
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default App;
