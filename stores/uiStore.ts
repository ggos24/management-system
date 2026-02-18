import { create } from 'zustand';
import { Task } from '../types';

interface Notification {
  id: number;
  text: string;
  time: string;
}

interface UiState {
  currentView: string;
  isDarkMode: boolean;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  searchQuery: string;
  isNotificationsOpen: boolean;
  notifications: Notification[];

  // Modal states
  isTaskModalOpen: boolean;
  taskModalData: Partial<Task>;
  isSettingsModalOpen: boolean;
  isLogoutModalOpen: boolean;
  isManageTeamsModalOpen: boolean;
  isInviteModalOpen: boolean;
  isShareOpen: boolean;
  isAiChatOpen: boolean;
  activeSettingsTab: string;

  // Team management UI
  newTeamName: string;
  newTeamIcon: string;
  editingTeamId: string | null;
  teamToDelete: string | null;
  deleteConfirmationInput: string;
  isIconPickerOpen: boolean;

  // Invite form
  inviteForm: { email: string; name: string; role: string; jobTitle: string; teamId: string };
  inviteLoading: boolean;
  inviteError: string | null;

  // AI Chat
  aiChatMessages: { role: 'user' | 'ai'; text: string }[];
  aiChatInput: string;
  aiChatLoading: boolean;

  // Actions
  setCurrentView: (view: string) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setIsNotificationsOpen: (open: boolean) => void;
  markNotificationsRead: () => void;

  setIsTaskModalOpen: (open: boolean) => void;
  setTaskModalData: (data: Partial<Task> | ((prev: Partial<Task>) => Partial<Task>)) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  setIsLogoutModalOpen: (open: boolean) => void;
  setIsManageTeamsModalOpen: (open: boolean) => void;
  setIsInviteModalOpen: (open: boolean) => void;
  setIsShareOpen: (open: boolean) => void;
  setIsAiChatOpen: (open: boolean) => void;
  setActiveSettingsTab: (tab: string) => void;

  setNewTeamName: (name: string) => void;
  setNewTeamIcon: (icon: string) => void;
  setEditingTeamId: (id: string | null) => void;
  setTeamToDelete: (id: string | null) => void;
  setDeleteConfirmationInput: (input: string) => void;
  setIsIconPickerOpen: (open: boolean) => void;

  setInviteForm: (form: { email: string; name: string; role: string; jobTitle: string; teamId: string }) => void;
  setInviteLoading: (loading: boolean) => void;
  setInviteError: (error: string | null) => void;

  setAiChatMessages: (msgs: { role: 'user' | 'ai'; text: string }[]) => void;
  addAiChatMessage: (msg: { role: 'user' | 'ai'; text: string }) => void;
  setAiChatInput: (input: string) => void;
  setAiChatLoading: (loading: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  currentView: 'dashboard',
  isDarkMode: false,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  searchQuery: '',
  isNotificationsOpen: false,
  notifications: [
    { id: 1, text: 'New comment on "AI Trends"', time: '2 hours ago' },
    { id: 2, text: 'Task "Q3 Strategy" is overdue', time: '5 hours ago' },
    { id: 3, text: 'Welcome to the team!', time: '1 day ago' },
  ],

  isTaskModalOpen: false,
  taskModalData: {},
  isSettingsModalOpen: false,
  isLogoutModalOpen: false,
  isManageTeamsModalOpen: false,
  isInviteModalOpen: false,
  isShareOpen: false,
  isAiChatOpen: false,
  activeSettingsTab: 'My Profile',

  newTeamName: '',
  newTeamIcon: 'Hash',
  editingTeamId: null,
  teamToDelete: null,
  deleteConfirmationInput: '',
  isIconPickerOpen: false,

  inviteForm: { email: '', name: '', role: 'user', jobTitle: '', teamId: '' },
  inviteLoading: false,
  inviteError: null,

  aiChatMessages: [],
  aiChatInput: '',
  aiChatLoading: false,

  // Actions
  setCurrentView: (view) => set({ currentView: view }),
  toggleTheme: () => {
    const newMode = !get().isDarkMode;
    set({ isDarkMode: newMode });
    document.documentElement.classList.toggle('dark');
  },
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsNotificationsOpen: (open) => set({ isNotificationsOpen: open }),
  markNotificationsRead: () => set({ notifications: [] }),

  setIsTaskModalOpen: (open) => set({ isTaskModalOpen: open }),
  setTaskModalData: (data) =>
    set((state) => ({
      taskModalData: typeof data === 'function' ? data(state.taskModalData) : data,
    })),
  setIsSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
  setIsLogoutModalOpen: (open) => set({ isLogoutModalOpen: open }),
  setIsManageTeamsModalOpen: (open) => set({ isManageTeamsModalOpen: open }),
  setIsInviteModalOpen: (open) => set({ isInviteModalOpen: open }),
  setIsShareOpen: (open) => set({ isShareOpen: open }),
  setIsAiChatOpen: (open) => set({ isAiChatOpen: open }),
  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

  setNewTeamName: (name) => set({ newTeamName: name }),
  setNewTeamIcon: (icon) => set({ newTeamIcon: icon }),
  setEditingTeamId: (id) => set({ editingTeamId: id }),
  setTeamToDelete: (id) => set({ teamToDelete: id }),
  setDeleteConfirmationInput: (input) => set({ deleteConfirmationInput: input }),
  setIsIconPickerOpen: (open) => set({ isIconPickerOpen: open }),

  setInviteForm: (form) => set({ inviteForm: form }),
  setInviteLoading: (loading) => set({ inviteLoading: loading }),
  setInviteError: (error) => set({ inviteError: error }),

  setAiChatMessages: (msgs) => set({ aiChatMessages: msgs }),
  addAiChatMessage: (msg) => set({ aiChatMessages: [...get().aiChatMessages, msg] }),
  setAiChatInput: (input) => set({ aiChatInput: input }),
  setAiChatLoading: (loading) => set({ aiChatLoading: loading }),
}));
