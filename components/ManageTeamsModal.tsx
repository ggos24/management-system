import React from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Edit2, Archive, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { IconComponent, ICONS } from './IconComponent';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { Team } from '../types';

export const ManageTeamsModal: React.FC = () => {
  const {
    isManageTeamsModalOpen,
    setIsManageTeamsModalOpen,
    newTeamName,
    setNewTeamName,
    newTeamIcon,
    setNewTeamIcon,
    editingTeamId,
    setEditingTeamId,
    teamToDelete,
    setTeamToDelete,
    deleteConfirmationInput,
    setDeleteConfirmationInput,
    isIconPickerOpen,
    setIsIconPickerOpen,
  } = useUiStore();

  const currentUser = useAuthStore((s) => s.currentUser);
  const { teams, addTeam, deleteTeam, archiveTeam, saveTeamEdit, toggleTeamVisibility } = useDataStore();

  const handleAddTeam = () => {
    if (!newTeamName) return;
    const newTeam: Team = {
      id: crypto.randomUUID(),
      name: newTeamName,
      icon: newTeamIcon,
      scheduleType: 'shift-based',
      hidden: false,
      archived: false,
      sortOrder: teams.length,
    };
    addTeam(newTeam);
    setNewTeamName('');
    setNewTeamIcon('Hash');
  };

  const handleDeleteTeam = (id: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast.error('Only admins can delete workspaces.');
      return;
    }
    setTeamToDelete(id);
    setDeleteConfirmationInput('');
  };

  const confirmDeleteTeam = () => {
    if (teamToDelete && deleteConfirmationInput === '/iwanttodelete') {
      deleteTeam(teamToDelete);
      setTeamToDelete(null);
      setDeleteConfirmationInput('');
    }
  };

  return (
    <Modal isOpen={isManageTeamsModalOpen} onClose={() => setIsManageTeamsModalOpen(false)} title="Manage Workspaces">
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
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => {
                        setNewTeamIcon(icon);
                        setIsIconPickerOpen(false);
                      }}
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
              className="flex-1 p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <button
              onClick={handleAddTeam}
              className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Create
            </button>
          </div>
        </div>

        <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full"></div>

        <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
          <h4 className="text-xs font-bold text-zinc-500 uppercase">Existing Workspaces</h4>
          <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {teams.map((team) => (
              <div
                key={team.id}
                className={`border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 group ${team.archived ? 'opacity-60 grayscale' : ''}`}
              >
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
                        onBlur={(e) => {
                          saveTeamEdit(team.id, e.target.value, team.icon);
                          setEditingTeamId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveTeamEdit(team.id, e.currentTarget.value, team.icon);
                            setEditingTeamId(null);
                          }
                        }}
                      />
                    ) : (
                      <p className="text-sm font-bold">
                        {team.name}{' '}
                        {team.archived && (
                          <span className="text-[10px] font-normal text-zinc-400 uppercase ml-2">(Archived)</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleTeamVisibility(team.id)}
                      className="p-1.5 text-zinc-400 hover:text-black dark:hover:text-white"
                      title={team.hidden ? 'Show' : 'Hide'}
                    >
                      {team.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingTeamId(team.id)}
                      className="p-1.5 text-zinc-400 hover:text-blue-500"
                      title="Rename"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => archiveTeam(team.id)}
                      className={`p-1.5 text-zinc-400 hover:text-yellow-600 ${team.archived ? 'text-yellow-600' : ''}`}
                      title={team.archived ? 'Unarchive' : 'Archive'}
                    >
                      <Archive size={14} />
                    </button>
                    {team.id !== 'management' && (
                      <button
                        onClick={() => handleDeleteTeam(team.id)}
                        className="p-1.5 text-zinc-400 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {teamToDelete && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900 space-y-2 animate-in fade-in slide-in-from-top-2">
            <p className="text-sm text-red-700 dark:text-red-300 font-bold">
              Are you sure you want to delete this workspace?
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Type <span className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">/iwanttodelete</span> to
              confirm.
            </p>
            <div className="flex gap-2 mt-2">
              <input
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                className="flex-1 p-2 bg-zinc-50 dark:bg-zinc-900 border border-red-300 dark:border-red-800 rounded-lg text-sm outline-none focus:ring-1 focus:ring-red-400"
              />
              <button
                onClick={confirmDeleteTeam}
                disabled={deleteConfirmationInput !== '/iwanttodelete'}
                className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold disabled:opacity-50 hover:bg-red-700"
              >
                Confirm
              </button>
              <button onClick={() => setTeamToDelete(null)} className="text-zinc-500 text-sm hover:underline px-2">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
