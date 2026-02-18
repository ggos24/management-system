import React from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { supabase } from '../lib/supabase';
import { Member } from '../types';

export const InviteModal: React.FC = () => {
  const {
    isInviteModalOpen,
    setIsInviteModalOpen,
    inviteForm,
    setInviteForm,
    inviteLoading,
    setInviteLoading,
    inviteError,
    setInviteError,
  } = useUiStore();

  const currentUser = useAuthStore((s) => s.currentUser);
  const { teams, setMembers, setPermissions, setLogs, members, permissions, logs } = useDataStore();

  const handleInviteMember = async () => {
    if (!currentUser || !inviteForm.email || !inviteForm.name) return;
    setInviteLoading(true);
    setInviteError(null);

    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: inviteForm.email,
          name: inviteForm.name,
          role: inviteForm.role || 'user',
          jobTitle: inviteForm.jobTitle || 'Team Member',
          teamId: inviteForm.teamId || teams[0]?.id || '',
        },
      });

      setInviteLoading(false);

      if (error) {
        let message = 'Failed to send invitation';
        try {
          if (data?.error) {
            message = data.error;
          } else if (error.message) {
            message = error.message;
          }
        } catch {
          // keep default message
        }
        setInviteError(message);
        return;
      }

      if (data?.error) {
        setInviteError(data.error);
        return;
      }

      const profile = data.profile as Member;
      setMembers([...members, profile]);
      setPermissions({
        ...permissions,
        [profile.id]: { canEdit: false, canDelete: false, canCreate: true },
      });

      const logEntry = {
        id: crypto.randomUUID(),
        action: 'Member Invited',
        details: `Invited ${inviteForm.name} (${inviteForm.email}) to the workspace`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
      };
      setLogs([logEntry, ...logs]);

      setInviteForm({ email: '', name: '', role: 'user', jobTitle: '', teamId: '' });
      setIsInviteModalOpen(false);
    } catch (err: unknown) {
      setInviteLoading(false);
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  return (
    <Modal
      isOpen={isInviteModalOpen}
      onClose={() => {
        setIsInviteModalOpen(false);
        setInviteError(null);
      }}
      title="Invite Member"
      actions={
        <>
          <button
            onClick={() => {
              setIsInviteModalOpen(false);
              setInviteError(null);
            }}
            className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
          <button
            onClick={handleInviteMember}
            disabled={inviteLoading || !inviteForm.email || !inviteForm.name}
            className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {inviteLoading ? 'Sending...' : 'Send Invitation'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {inviteError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <X size={16} className="flex-shrink-0" />
            {inviteError}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Email *</label>
          <input
            type="email"
            required
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
            placeholder="colleague@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Full Name *</label>
          <input
            type="text"
            required
            value={inviteForm.name}
            onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
            placeholder="John Doe"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Role</label>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Job Title</label>
            <input
              type="text"
              value={inviteForm.jobTitle}
              onChange={(e) => setInviteForm({ ...inviteForm, jobTitle: e.target.value })}
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
              placeholder="e.g. Senior Editor"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Team</label>
          <select
            value={inviteForm.teamId}
            onChange={(e) => setInviteForm({ ...inviteForm, teamId: e.target.value })}
            className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
          >
            <option value="">Select a team...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
};
