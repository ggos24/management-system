import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Mail,
  Loader2,
  CheckCircle2,
  Unlink,
  Pencil,
  Check,
  X,
  ChevronDown,
  Plus,
  Trash2,
  Globe,
  Search,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { AbsenceStatsCard } from './AbsenceStatsCard';
import { CustomSelect } from './CustomSelect';
import { MultiSelect } from './MultiSelect';
import { DateRangeFilter } from './DateRangeFilter';
import { calculateAbsenceStats } from '../lib/utils';
import {
  uploadAvatar,
  fetchTelegramLink,
  upsertTelegramLinkCode,
  deleteTelegramLink,
  updateProfileEmailNotifications,
  TelegramLink,
} from '../lib/database';
import { Label, Badge, Input } from './ui';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { isEditorOrAbove, isAdmin } from '../constants';
import type { LogEntry, Member } from '../types';

type BadgeColor = 'zinc' | 'emerald' | 'red' | 'blue' | 'amber' | 'purple';

function getActionColor(action: string): BadgeColor {
  if (/created|added|invited|approved|restored/i.test(action)) return 'emerald';
  if (/deleted|removed|declined|emptied/i.test(action)) return 'red';
  if (/updated|changed|moved/i.test(action)) return 'blue';
  if (/permission/i.test(action)) return 'amber';
  if (/integration/i.test(action)) return 'purple';
  return 'zinc';
}

const ENTITY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'task', label: 'Task' },
  { value: 'team', label: 'Team' },
  { value: 'member', label: 'Member' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'integration', label: 'Integration' },
  { value: 'permission', label: 'Permission' },
];

const LogsHistoryTab: React.FC<{ logs: LogEntry[]; members: Member[] }> = ({ logs, members }) => {
  const [searchText, setSearchText] = useState('');
  const [filterEntity, setFilterEntity] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [localSearch, setLocalSearch] = useState('');

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setSearchText(val), 300);
  }, []);

  const userOptions = useMemo(
    () => [{ value: 'all', label: 'All Users' }, ...members.map((m) => ({ value: m.id, label: m.name }))],
    [members],
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterUser !== 'all' && log.userId !== filterUser) return false;
      if (filterEntity !== 'all' && (log.entityType || '') !== filterEntity) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!log.action.toLowerCase().includes(q) && !log.details.toLowerCase().includes(q)) return false;
      }
      if (dateStart || dateEnd) {
        const logDate = log.timestamp.slice(0, 10);
        if (dateStart && logDate < dateStart) return false;
        if (dateEnd && logDate > dateEnd) return false;
      }
      return true;
    });
  }, [logs, filterUser, filterEntity, searchText, dateStart, dateEnd]);

  return (
    <div className="space-y-3 h-full overflow-hidden flex flex-col">
      <Label variant="section" className="flex-shrink-0">
        Activity Logs
      </Label>

      {/* Search */}
      <div className="relative flex-shrink-0">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search logs..."
          value={localSearch}
          onChange={handleSearchChange}
          className="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-2 flex-shrink-0">
        <DateRangeFilter
          startDate={dateStart}
          endDate={dateEnd}
          onChange={(s, e) => {
            setDateStart(s);
            setDateEnd(e);
          }}
        />
        <CustomSelect value={filterEntity} onChange={setFilterEntity} options={ENTITY_TYPE_OPTIONS} />
        <CustomSelect value={filterUser} onChange={setFilterUser} options={userOptions} />
      </div>

      {/* Result count */}
      <div className="text-[11px] text-zinc-400 flex-shrink-0">
        Showing {filteredLogs.length} of {logs.length} logs
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar border border-zinc-200 dark:border-zinc-700 rounded-lg">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-zinc-400">No matching logs</div>
        ) : (
          filteredLogs.map((log) => {
            const user = members.find((m) => m.id === log.userId);
            return (
              <div
                key={log.id}
                className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge color={getActionColor(log.action)}>{log.action}</Badge>
                  <span className="text-[10px] text-zinc-400">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">{log.details}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Avatar src={user?.avatar} size="xs" />
                  <span className="text-xs text-zinc-500">{user?.name || 'Unknown User'}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setIsSettingsModalOpen, activeSettingsTab, setActiveSettingsTab, setIsInviteModalOpen } =
    useUiStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const {
    members,
    absences,
    logs,
    teams,
    removeMember,
    updateMemberAvatar,
    updateMemberName,
    updateMemberJobTitle,
    updateMemberTeams,
    updateMemberRole,
    allPlacements,
    addPlacement,
    renamePlacement,
    deletePlacement,
    teamTypes,
    addType,
    deleteType,
    renameType,
    teamPlacements,
    addTeamPlacement,
    deleteTeamPlacement,
    renameTeamPlacement,
  } = useDataStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingJobTitle, setEditingJobTitle] = useState(false);
  const [jobTitleDraft, setJobTitleDraft] = useState('');
  const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null);
  const [placementDraft, setPlacementDraft] = useState('');
  const [newPlacementName, setNewPlacementName] = useState('');
  const [selectedContentTeamId, setSelectedContentTeamId] = useState<string>('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState('');
  const [newTypeName, setNewTypeName] = useState('');

  // Telegram linking state
  const [telegramLink, setTelegramLink] = useState<TelegramLink | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);

  const loadTelegramLink = useCallback(async () => {
    if (!currentUser) return;
    try {
      const link = await fetchTelegramLink(currentUser.id);
      setTelegramLink(link);
      setTelegramCode(link?.linkCode || null);
    } catch {
      // Non-critical
    }
  }, [currentUser]);

  useEffect(() => {
    if (isSettingsModalOpen && activeSettingsTab === 'Notifications') {
      loadTelegramLink();
    }
  }, [isSettingsModalOpen, activeSettingsTab, loadTelegramLink]);

  // Auto-select first team when Content tab opens
  const nonArchivedTeams = teams.filter((t) => !t.archived);
  useEffect(() => {
    if (
      isSettingsModalOpen &&
      activeSettingsTab === 'Content' &&
      !selectedContentTeamId &&
      nonArchivedTeams.length > 0
    ) {
      setSelectedContentTeamId(nonArchivedTeams[0].id);
    }
  }, [isSettingsModalOpen, activeSettingsTab, selectedContentTeamId, nonArchivedTeams]);

  const generateTelegramCode = async () => {
    if (!currentUser) return;
    setTelegramLoading(true);
    try {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(3)))
        .map((b) => b.toString(36).toUpperCase().padStart(2, '0'))
        .join('')
        .slice(0, 6);
      const link = await upsertTelegramLinkCode(currentUser.id, code);
      setTelegramLink(link);
      setTelegramCode(code);
      toast.success('Code generated');
    } catch {
      toast.error('Failed to generate code');
    } finally {
      setTelegramLoading(false);
    }
  };

  const unlinkTelegram = async () => {
    if (!currentUser) return;
    setTelegramLoading(true);
    try {
      await deleteTelegramLink(currentUser.id);
      setTelegramLink(null);
      setTelegramCode(null);
      toast.success('Telegram unlinked');
    } catch {
      toast.error('Failed to unlink');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleChangeAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB');
      return;
    }

    setUploading(true);
    try {
      const publicUrl = await uploadAvatar(currentUser.id, file);
      updateMemberAvatar(currentUser.id, publicUrl);
      setCurrentUser({ ...currentUser, avatar: publicUrl });
      toast.success('Avatar updated');
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setUploading(false);
      // Reset so re-selecting the same file triggers onChange
      e.target.value = '';
    }
  };

  const renderSettingsContent = () => {
    if (!currentUser) return null;
    switch (activeSettingsTab) {
      case 'My Profile': {
        const myAbsenceStats = calculateAbsenceStats(currentUser.id, absences);
        return (
          <div className="space-y-6">
            <div className="flex items-start gap-5 border-b border-zinc-100 dark:border-zinc-800 pb-6">
              <div className="relative group flex-shrink-0">
                <Avatar src={currentUser.avatar} size="lg" className="!w-20 !h-20" />
                <button
                  onClick={handleChangeAvatar}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploading ? (
                    <Loader2 size={18} className="text-white animate-spin" />
                  ) : (
                    <Pencil size={18} className="text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-3">
                  {editingName ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = nameDraft.trim();
                        if (trimmed && trimmed !== currentUser.name) {
                          updateMemberName(currentUser.id, trimmed);
                          setCurrentUser({ ...currentUser, name: trimmed });
                          toast.success('Name updated');
                        }
                        setEditingName(false);
                      }}
                    >
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="text-lg font-semibold bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-500 w-48"
                      />
                      <button type="submit" className="text-emerald-500 hover:text-emerald-600">
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingName(false)}
                        className="text-zinc-400 hover:text-zinc-600"
                      >
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <h3
                      className="text-lg font-semibold group flex items-center gap-1.5 cursor-pointer"
                      onClick={() => {
                        setNameDraft(currentUser.name);
                        setEditingName(true);
                      }}
                    >
                      {currentUser.name}
                      <Pencil
                        size={14}
                        className="text-zinc-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      />
                    </h3>
                  )}
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium capitalize">
                    {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'editor' ? 'Editor' : 'User'}
                  </span>
                </div>
                {editingJobTitle ? (
                  <form
                    className="flex items-center gap-1.5 mt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = jobTitleDraft.trim();
                      if (trimmed !== currentUser.jobTitle) {
                        updateMemberJobTitle(currentUser.id, trimmed);
                        setCurrentUser({ ...currentUser, jobTitle: trimmed });
                        toast.success('Job title updated');
                      }
                      setEditingJobTitle(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={jobTitleDraft}
                      onChange={(e) => setJobTitleDraft(e.target.value)}
                      className="text-sm bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-500 w-48 text-zinc-600 dark:text-zinc-400"
                    />
                    <button type="submit" className="text-emerald-500 hover:text-emerald-600">
                      <Check size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingJobTitle(false)}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={16} />
                    </button>
                  </form>
                ) : (
                  <p
                    className="text-zinc-500 text-sm group flex items-center gap-1.5 cursor-pointer mt-1"
                    onClick={() => {
                      setJobTitleDraft(currentUser.jobTitle || '');
                      setEditingJobTitle(true);
                    }}
                  >
                    {currentUser.jobTitle || 'Add job title...'}
                    <Pencil
                      size={12}
                      className="text-zinc-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    />
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label variant="section">My Absences</Label>
              <AbsenceStatsCard stats={myAbsenceStats} />
            </div>
          </div>
        );
      }
      case 'Notifications': {
        const isLinked = telegramLink?.chatId != null;
        const emailEnabled = currentUser.emailNotifications !== false;
        return (
          <div className="space-y-4">
            <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-blue-500" />
                  <span className="text-sm font-medium">Email Notifications</span>
                </div>
                <span
                  className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${emailEnabled ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400'}`}
                >
                  {emailEnabled ? (
                    <>
                      <CheckCircle2 size={12} /> Enabled
                    </>
                  ) : (
                    'Disabled'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {emailEnabled
                    ? 'You receive email notifications for task assignments and status changes.'
                    : 'Email notifications are turned off.'}
                </p>
                <button
                  onClick={() => {
                    const newVal = !emailEnabled;
                    updateProfileEmailNotifications(currentUser.id, newVal).catch(() =>
                      toast.error('Failed to update email preference'),
                    );
                    setCurrentUser({ ...currentUser, emailNotifications: newVal });
                    toast.success(newVal ? 'Email notifications enabled' : 'Email notifications disabled');
                  }}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${emailEnabled ? 'text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                >
                  {emailEnabled ? 'Turn off' : 'Turn on'}
                </button>
              </div>
            </div>

            <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Send size={16} className="text-[#0088cc]" />
                  <span className="text-sm font-medium">Telegram</span>
                </div>
                {isLinked && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                )}
              </div>

              {isLinked ? (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-zinc-500">Notifications are being sent to your Telegram.</p>
                  <button
                    onClick={unlinkTelegram}
                    disabled={telegramLoading}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    {telegramLoading ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                    Unlink
                  </button>
                </div>
              ) : telegramCode ? (
                <div className="space-y-3 pt-1">
                  <a
                    href={`https://t.me/managment_system_bot?start=${telegramCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={14} /> Connect in Telegram
                  </a>
                  <p className="text-xs text-zinc-500 text-center">
                    Click the button above, then press <b>Start</b> in Telegram to link.
                  </p>
                </div>
              ) : (
                <div className="pt-1">
                  <p className="text-xs text-zinc-500 mb-3">
                    Link your Telegram account to receive notifications as messages.
                  </p>
                  <button
                    onClick={generateTelegramCode}
                    disabled={telegramLoading}
                    className="w-full py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white text-sm font-medium rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {telegramLoading && <Loader2 size={14} className="animate-spin" />}
                    Generate Code
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label variant="section">Your Notifications</Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                These are the notifications you receive in-app, via email (if enabled), and via Telegram (if linked).
              </p>
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-left">
                      <th className="px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">Notification</th>
                      <th className="px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">When you receive it</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    <tr>
                      <td className="px-3 py-2 font-medium">Task assigned</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">You are assigned to a task</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Task unassigned</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">You are removed from a task</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Status changed</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        A task you're assigned to changes status
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Task updated</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        Title, priority, due date, or fields change on your task
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Task deleted</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        A task you're assigned to is moved to bin
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Comment mention</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        Someone @mentions you in a task comment
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Absence decision</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        Your absence request is approved or declined
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Schedule updated</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        An admin adds or changes an absence or shift on your schedule
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin(currentUser.role) && (
              <div className="space-y-2">
                <Label variant="section">Admin Notifications</Label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Additional notifications you receive as an admin.
                </p>
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-left">
                        <th className="px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">Notification</th>
                        <th className="px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">When you receive it</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      <tr>
                        <td className="px-3 py-2 font-medium">Absence submitted</td>
                        <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                          Any team member submits an absence request
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Absence cancelled</td>
                        <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                          Any team member cancels their absence request
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Member invited</td>
                        <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                          Another admin invites a new member
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      }
      case 'Team Members':
        return (
          <div>
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
              {members.map((m) => {
                const isMe = m.id === currentUser.id;
                const canManage = isAdmin(currentUser.role);
                const roleOptions = [
                  { value: 'admin', label: 'Admin' },
                  { value: 'editor', label: 'Editor' },
                  { value: 'user', label: 'User' },
                ];
                // Hidden teams are still valid assignment targets — "hidden" only
                // removes them from the workspace navigation, not from member/team
                // management or the schedule. Archived teams are excluded.
                const teamOptions = teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }));
                const roleLabel = m.role === 'admin' ? 'Admin' : m.role === 'editor' ? 'Editor' : 'User';
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={m.avatar} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.name}
                          {isMe && <span className="text-zinc-400 font-normal ml-1">(you)</span>}
                        </p>
                        {m.jobTitle && <p className="text-xs text-zinc-500 truncate">{m.jobTitle}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canManage ? (
                        <>
                          <div className="min-w-[180px] max-w-[260px]">
                            <MultiSelect
                              compact
                              icon={Users}
                              label=""
                              options={teamOptions}
                              selected={m.teamIds}
                              onChange={(next) => {
                                const prev = m.teamIds;
                                updateMemberTeams(m.id, next);
                                if (isMe) {
                                  setCurrentUser({ ...currentUser, teamId: next[0] || '', teamIds: next });
                                }
                                // Surface what actually changed so admins get clear feedback
                                const added = next.filter((id) => !prev.includes(id));
                                const removed = prev.filter((id) => !next.includes(id));
                                if (added.length > 0) {
                                  const names = added
                                    .map((id) => teams.find((t) => t.id === id)?.name || '')
                                    .join(', ');
                                  toast.success(`${m.name} added to ${names}`);
                                } else if (removed.length > 0) {
                                  const names = removed
                                    .map((id) => teams.find((t) => t.id === id)?.name || '')
                                    .join(', ');
                                  toast.success(`${m.name} removed from ${names}`);
                                }
                              }}
                              placeholder="No teams"
                              searchable
                            />
                          </div>
                          {isMe && (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{roleLabel}</span>
                          )}
                          {!isMe && (
                            <>
                              <CustomSelect
                                compact
                                value={m.role}
                                onChange={(newRole) => {
                                  updateMemberRole(m.id, newRole as any);
                                  toast.success(
                                    `${m.name} is now ${newRole === 'admin' ? 'Admin' : newRole === 'editor' ? 'Editor' : 'User'}`,
                                  );
                                }}
                                options={roleOptions}
                                renderValue={(v) => (
                                  <span className="flex items-center gap-1 text-xs">
                                    {v === 'admin' ? 'Admin' : v === 'editor' ? 'Editor' : 'User'}
                                    <ChevronDown size={12} className="text-zinc-400" />
                                  </span>
                                )}
                                dropdownMinWidth={110}
                                className="w-auto"
                              />
                              <button
                                onClick={() => {
                                  if (confirm(`Remove ${m.name} from the team?`)) {
                                    removeMember(m.id, currentUser.id);
                                  }
                                }}
                                className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{roleLabel}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {isAdmin(currentUser.role) && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="w-full py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors mt-3"
              >
                + Invite Member
              </button>
            )}
          </div>
        );
      case 'Logs History':
        return <LogsHistoryTab logs={logs} members={members} />;
      case 'Content': {
        const currentTypes = selectedContentTeamId ? teamTypes[selectedContentTeamId] || [] : [];
        const currentPlacements = selectedContentTeamId ? teamPlacements[selectedContentTeamId] || [] : [];
        return (
          <div className="space-y-5">
            {/* Workspace selector */}
            <div>
              <Label variant="section">Workspace</Label>
              <CustomSelect
                value={selectedContentTeamId}
                onChange={(id) => {
                  setSelectedContentTeamId(id);
                  setEditingTypeId(null);
                  setEditingPlacementId(null);
                }}
                placeholder="Select workspace..."
                options={nonArchivedTeams.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>

            {selectedContentTeamId && (
              <>
                {/* Content Types section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label variant="section" className="!mb-0">
                      Content Types
                    </Label>
                    <span className="text-xs text-zinc-400">{currentTypes.length}</span>
                  </div>
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
                    {currentTypes.map((t) => (
                      <div
                        key={t}
                        className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                      >
                        {editingTypeId === t ? (
                          <form
                            className="flex items-center gap-1.5 flex-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = typeDraft.trim();
                              if (trimmed && trimmed !== t) {
                                if (currentTypes.includes(trimmed)) {
                                  toast.error('Content type already exists');
                                  return;
                                }
                                renameType(selectedContentTeamId, t, trimmed);
                                toast.success('Content type renamed');
                              }
                              setEditingTypeId(null);
                            }}
                          >
                            <input
                              autoFocus
                              value={typeDraft}
                              onChange={(e) => setTypeDraft(e.target.value)}
                              className="flex-1 text-sm bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button type="submit" className="text-emerald-500 hover:text-emerald-600">
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTypeId(null)}
                              className="text-zinc-400 hover:text-zinc-600"
                            >
                              <X size={14} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <span
                              className="text-sm cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                              onClick={() => {
                                setEditingTypeId(t);
                                setTypeDraft(t);
                              }}
                            >
                              {t}
                            </span>
                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingTypeId(t);
                                  setTypeDraft(t);
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete "${t}"?`)) {
                                    deleteType(selectedContentTeamId, t);
                                    toast.success('Content type deleted');
                                  }
                                }}
                                className="p-1 text-zinc-400 hover:text-red-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {currentTypes.length === 0 && (
                      <div className="px-3 py-4 text-sm text-zinc-400 text-center">No content types yet</div>
                    )}
                  </div>
                  <form
                    className="flex gap-2 mt-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = newTypeName.trim();
                      if (!trimmed) return;
                      if (currentTypes.includes(trimmed)) {
                        toast.error('Content type already exists');
                        return;
                      }
                      addType(selectedContentTeamId, trimmed);
                      setNewTypeName('');
                      toast.success('Content type added');
                    }}
                  >
                    <input
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      placeholder="New content type..."
                      className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!newTypeName.trim()}
                      className="px-3 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </form>
                </div>

                {/* Placements section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Globe size={16} className="text-zinc-400" />
                    <Label variant="section" className="!mb-0">
                      Placements
                    </Label>
                    <span className="text-xs text-zinc-400">{currentPlacements.length}</span>
                  </div>
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
                    {currentPlacements.map((p) => (
                      <div
                        key={p}
                        className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                      >
                        {editingPlacementId === p ? (
                          <form
                            className="flex items-center gap-1.5 flex-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = placementDraft.trim();
                              if (trimmed && trimmed !== p) {
                                if (currentPlacements.includes(trimmed)) {
                                  toast.error('Placement already exists');
                                  return;
                                }
                                renameTeamPlacement(selectedContentTeamId, p, trimmed);
                                toast.success('Placement renamed');
                              }
                              setEditingPlacementId(null);
                            }}
                          >
                            <input
                              autoFocus
                              value={placementDraft}
                              onChange={(e) => setPlacementDraft(e.target.value)}
                              className="flex-1 text-sm bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button type="submit" className="text-emerald-500 hover:text-emerald-600">
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPlacementId(null)}
                              className="text-zinc-400 hover:text-zinc-600"
                            >
                              <X size={14} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <span
                              className="text-sm cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
                              onClick={() => {
                                setEditingPlacementId(p);
                                setPlacementDraft(p);
                              }}
                            >
                              {p}
                            </span>
                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingPlacementId(p);
                                  setPlacementDraft(p);
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete "${p}"? It will be removed from this workspace.`)) {
                                    deleteTeamPlacement(selectedContentTeamId, p);
                                    toast.success('Placement deleted');
                                  }
                                }}
                                className="p-1 text-zinc-400 hover:text-red-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {currentPlacements.length === 0 && (
                      <div className="px-3 py-4 text-sm text-zinc-400 text-center">No placements yet</div>
                    )}
                  </div>
                  <form
                    className="flex gap-2 mt-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = newPlacementName.trim();
                      if (!trimmed) return;
                      if (currentPlacements.includes(trimmed)) {
                        toast.error('Placement already exists');
                        return;
                      }
                      addTeamPlacement(selectedContentTeamId, trimmed);
                      // Also add to global placements for task persistence
                      if (!allPlacements.includes(trimmed)) addPlacement(trimmed);
                      setNewPlacementName('');
                      toast.success('Placement added');
                    }}
                  >
                    <input
                      value={newPlacementName}
                      onChange={(e) => setNewPlacementName(e.target.value)}
                      placeholder="New placement..."
                      className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!newPlacementName.trim()}
                      className="px-3 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings">
      <div className="flex gap-6 h-[560px]">
        <div className="w-48 border-r border-zinc-100 dark:border-zinc-800 pr-4 space-y-1 shrink-0">
          {[
            'My Profile',
            'Notifications',
            'Team Members',
            ...(currentUser && isEditorOrAbove(currentUser.role) ? ['Content'] : []),
            'Logs History',
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSettingsTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeSettingsTab === tab ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">{renderSettingsContent()}</div>
      </div>
    </Modal>
  );
};
