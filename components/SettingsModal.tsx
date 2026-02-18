import React from 'react';
import { Send } from 'lucide-react';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { Toggle } from './Toggle';
import { AbsenceStatsCard } from './AbsenceStatsCard';
import { calculateAbsenceStats } from '../lib/utils';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setIsSettingsModalOpen, activeSettingsTab, setActiveSettingsTab, setIsInviteModalOpen } =
    useUiStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const {
    members,
    absences,
    logs,
    permissions,
    integrations,
    togglePermission,
    removeMember,
    updateMemberAvatar,
    toggleIntegration,
  } = useDataStore();

  const handleChangeAvatar = () => {
    if (!currentUser) return;
    const newAvatar = `https://picsum.photos/100/100?random=${Math.floor(Math.random() * 1000)}`;
    updateMemberAvatar(currentUser.id, newAvatar);
  };

  const renderSettingsContent = () => {
    if (!currentUser) return null;
    switch (activeSettingsTab) {
      case 'My Profile': {
        const myAbsenceStats = calculateAbsenceStats(currentUser.id, absences);
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
              <Avatar src={currentUser.avatar} size="lg" className="!w-20 !h-20" />
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">{currentUser.name}</h3>
                  <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {currentUser.role}
                  </span>
                </div>
                <p className="text-zinc-500 text-sm">{currentUser.jobTitle}</p>
                <button onClick={handleChangeAvatar} className="text-sm text-blue-600 hover:underline mt-2">
                  Change Avatar
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-500 uppercase">My Absences</h4>
              <AbsenceStatsCard stats={myAbsenceStats} />
            </div>
          </div>
        );
      }
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
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="p-3 flex items-center gap-2">
                        <Avatar src={m.avatar} size="sm" />
                        <span className="font-medium">{m.name}</span>
                      </td>
                      <td className="p-3 text-center">
                        <Toggle
                          checked={permissions[m.id]?.canCreate ?? true}
                          onChange={() => togglePermission(m.id, 'canCreate')}
                          disabled={currentUser.role !== 'admin'}
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Toggle
                          checked={permissions[m.id]?.canEdit ?? m.role === 'admin'}
                          onChange={() => togglePermission(m.id, 'canEdit')}
                          disabled={currentUser.role !== 'admin'}
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Toggle
                          checked={permissions[m.id]?.canDelete ?? m.role === 'admin'}
                          onChange={() => togglePermission(m.id, 'canDelete')}
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
                <Toggle checked={true} onChange={() => {}} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Web Notifications</span>
                <Toggle checked={true} onChange={() => {}} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Telegram Notifications</span>
                <Toggle checked={true} onChange={() => {}} />
              </div>
            </div>
          </div>
        );
      case 'Team Members':
        return (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 border border-zinc-100 dark:border-zinc-800 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar src={m.avatar} size="md" />
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-zinc-500">
                      {m.jobTitle} &bull; {m.role}
                    </p>
                  </div>
                </div>
                {currentUser.role === 'admin' && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove this member?')) {
                        removeMember(m.id, currentUser.id);
                      }
                    }}
                    className="text-xs text-zinc-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {currentUser.role === 'admin' && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="w-full py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mt-2"
              >
                + Invite Member
              </button>
            )}
          </div>
        );
      case 'Integrations':
        return (
          <div className="space-y-4">
            <div className="p-3 border border-zinc-200 dark:border-zinc-700 rounded flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Send size={16} className="text-[#0088cc]" /> <span>Telegram</span>
              </div>
              <button
                onClick={() => toggleIntegration('telegram', currentUser.id)}
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
              {logs.map((log) => {
                const user = members.find((m) => m.id === log.userId);
                return (
                  <div
                    key={log.id}
                    className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-zinc-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{log.details}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Avatar src={user?.avatar} size="xs" />
                      <span className="text-xs text-zinc-500">{user?.name || 'Unknown User'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings">
      <div className="flex gap-6 min-h-[400px]">
        <div className="w-48 border-r border-zinc-100 dark:border-zinc-800 pr-4 space-y-1">
          {['My Profile', 'Permissions', 'Notifications', 'Team Members', 'Integrations', 'Logs History'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSettingsTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeSettingsTab === tab ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1">{renderSettingsContent()}</div>
      </div>
    </Modal>
  );
};
