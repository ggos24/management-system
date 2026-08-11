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

interface InviteFormValues {
  email: string;
  name: string;
  role: string;
  jobTitle: string;
  teamId: string;
  accessScope: 'full' | 'related_only';
}

export function buildInvitePayload(inviteForm: InviteFormValues, teams: Array<{ id: string }>) {
  const isExternal = inviteForm.accessScope === 'related_only';
  return {
    email: inviteForm.email,
    name: inviteForm.name,
    role: isExternal ? 'user' : inviteForm.role || 'user',
    jobTitle: inviteForm.jobTitle || 'Team Member',
    teamId: isExternal ? '' : inviteForm.teamId || teams[0]?.id || '',
    accessScope: isExternal ? ('related_only' as const) : ('full' as const),
  };
}

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
  const isExternal = inviteForm.accessScope === 'related_only';

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteError(null);
  };

  const handleInviteMember = async () => {
    if (!currentUser || !inviteForm.email || !inviteForm.name) return;
    setInviteLoading(true);
    setInviteError(null);

    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: buildInvitePayload(inviteForm, teams),
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
        [profile.id]: { canEdit: false, canDelete: false, canCreate: !isExternal },
      });

      const logEntry = {
        id: crypto.randomUUID(),
        action: 'Member Invited',
        details: `Invited ${inviteForm.name} (${inviteForm.email}) as ${isExternal ? 'an external collaborator' : 'an internal member'}`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
      };
      setLogs([logEntry, ...logs]);

      setInviteForm({ email: '', name: '', role: 'user', jobTitle: '', teamId: '', accessScope: 'full' });
      closeInviteModal();
    } catch (err: unknown) {
      setInviteLoading(false);
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  return (
    <Modal
      isOpen={isInviteModalOpen}
      onClose={closeInviteModal}
      title="Invite Member"
      size="md"
      actions={
        <>
          <Button variant="ghost" onClick={closeInviteModal}>
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
        <CustomSelect
          label="Member type"
          options={[
            { value: 'full', label: 'Internal member' },
            { value: 'related_only', label: 'External collaborator' },
          ]}
          value={inviteForm.accessScope}
          onChange={(value) => {
            const accessScope = value as 'full' | 'related_only';
            setInviteForm({
              ...inviteForm,
              accessScope,
              ...(accessScope === 'related_only' ? { role: 'user', teamId: '' } : {}),
            });
          }}
        />
        {isExternal && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
            External collaborators only see tasks assigned to them or tasks where they are mentioned, inside My
            Workspace.
          </div>
        )}
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
        <div className={`grid grid-cols-1 gap-4 ${isExternal ? '' : 'sm:grid-cols-2'}`}>
          {!isExternal && (
            <CustomSelect
              label="Role"
              options={[
                { value: 'user', label: 'User' },
                { value: 'editor', label: 'Editor' },
                { value: 'admin', label: 'Admin' },
              ]}
              value={inviteForm.role || 'user'}
              onChange={(val) => setInviteForm({ ...inviteForm, role: val })}
              placeholder="Select role..."
            />
          )}
          <FormField label="Job Title">
            <Input
              type="text"
              value={inviteForm.jobTitle}
              onChange={(e) => setInviteForm({ ...inviteForm, jobTitle: e.target.value })}
              placeholder="e.g. Senior Editor"
            />
          </FormField>
        </div>
        {!isExternal && (
          <CustomSelect
            label="Team"
            options={[{ value: '', label: 'Select a team...' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
            value={inviteForm.teamId || ''}
            onChange={(val) => setInviteForm({ ...inviteForm, teamId: val })}
            placeholder="Select a team..."
          />
        )}
      </div>
    </Modal>
  );
};
