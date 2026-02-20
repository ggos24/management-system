import React from 'react';
import { Modal } from './Modal';
import { AlertBanner } from './AlertBanner';
import { CustomSelect } from './CustomSelect';
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
            className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {inviteLoading ? 'Sending...' : 'Send Invitation'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {inviteError && <AlertBanner message={inviteError} />}
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase text-zinc-500 tracking-wider">Email *</label>
          <input
            type="email"
            required
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
            placeholder="colleague@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase text-zinc-500 tracking-wider">Full Name *</label>
          <input
            type="text"
            required
            value={inviteForm.name}
            onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
            placeholder="John Doe"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <CustomSelect
            label="Role"
            options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
            ]}
            value={inviteForm.role || 'user'}
            onChange={(val) => setInviteForm({ ...inviteForm, role: val })}
            placeholder="Select role..."
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase text-zinc-500 tracking-wider">Job Title</label>
            <input
              type="text"
              value={inviteForm.jobTitle}
              onChange={(e) => setInviteForm({ ...inviteForm, jobTitle: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-sm"
              placeholder="e.g. Senior Editor"
            />
          </div>
        </div>
        <CustomSelect
          label="Team"
          options={[{ value: '', label: 'Select a team...' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
          value={inviteForm.teamId || ''}
          onChange={(val) => setInviteForm({ ...inviteForm, teamId: val })}
          placeholder="Select a team..."
        />
      </div>
    </Modal>
  );
};
