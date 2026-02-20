import React from 'react';
import { Modal } from './Modal';
import { AlertBanner } from './AlertBanner';
import { CustomSelect } from './CustomSelect';
import { Button, Input, FormField } from './ui';
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
          <Button
            variant="ghost"
            onClick={() => {
              setIsInviteModalOpen(false);
              setInviteError(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleInviteMember} disabled={inviteLoading || !inviteForm.email || !inviteForm.name}>
            {inviteLoading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {inviteError && <AlertBanner message={inviteError} />}
        <FormField label="Email" required>
          <Input
            type="email"
            required
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            placeholder="colleague@company.com"
          />
        </FormField>
        <FormField label="Full Name" required>
          <Input
            type="text"
            required
            value={inviteForm.name}
            onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
            placeholder="John Doe"
          />
        </FormField>
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
          <FormField label="Job Title">
            <Input
              type="text"
              value={inviteForm.jobTitle}
              onChange={(e) => setInviteForm({ ...inviteForm, jobTitle: e.target.value })}
              placeholder="e.g. Senior Editor"
            />
          </FormField>
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
