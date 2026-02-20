import { create } from 'zustand';
import { toast } from 'sonner';
import { Task, Team, Member, Absence, Shift, LogEntry, CustomProperty, NotificationType } from '../types';
import * as db from '../lib/database';
import { useAuthStore } from './authStore';
import { supabase } from '../lib/supabase';

// === Notification helpers (fire-and-forget, non-critical) ===

function getCurrentUserId(): string | null {
  return useAuthStore.getState().currentUser?.id ?? null;
}

function getCurrentUserName(): string {
  return useAuthStore.getState().currentUser?.name ?? 'Someone';
}

function sendTelegram(recipientIds: string[], message: string, link?: string) {
  const text = link ? `${message}\n\n${link}` : message;
  supabase.functions.invoke('send-telegram', { body: { recipientIds, message: text } }).catch(console.error);
}

function buildAppLink(entityData?: Record<string, any>): string | undefined {
  const teamId = entityData?.teamId;
  if (!teamId) return undefined;
  return `${window.location.origin}/#${teamId}`;
}

function notifyMany(recipientIds: string[], type: NotificationType, message: string, entityData?: Record<string, any>) {
  const actorId = getCurrentUserId();
  // Filter out self-notifications
  const recipients = recipientIds.filter((id) => id !== actorId);
  if (recipients.length === 0) return;
  db.insertNotifications(recipients.map((recipientId) => ({ recipientId, actorId, type, message, entityData }))).catch(
    console.error,
  );
  sendTelegram(recipients, message, buildAppLink(entityData));
}

function notify(recipientId: string, type: NotificationType, message: string, entityData?: Record<string, any>) {
  const actorId = getCurrentUserId();
  if (recipientId === actorId) return; // Don't notify yourself
  db.insertNotification({ recipientId, actorId, type, message, entityData }).catch(console.error);
  sendTelegram([recipientId], message, buildAppLink(entityData));
}

interface DataState {
  tasks: Task[];
  teams: Team[];
  members: Member[];
  absences: Absence[];
  shifts: Shift[];
  logs: LogEntry[];
  teamStatuses: Record<string, string[]>;
  teamTypes: Record<string, string[]>;
  teamProperties: Record<string, CustomProperty[]>;
  archivedStatuses: Record<string, string[]>;
  permissions: Record<string, { canEdit: boolean; canDelete: boolean; canCreate: boolean }>;
  allPlacements: string[];
  integrations: Record<string, boolean>;

  // Setters
  setTasks: (tasks: Task[]) => void;
  setTeams: (teams: Team[]) => void;
  setMembers: (members: Member[]) => void;
  setAbsences: (absences: Absence[]) => void;
  setShifts: (shifts: Shift[]) => void;
  setLogs: (logs: LogEntry[]) => void;
  setTeamStatuses: (statuses: Record<string, string[]>) => void;
  setTeamTypes: (types: Record<string, string[]>) => void;
  setTeamProperties: (props: Record<string, CustomProperty[]>) => void;
  setArchivedStatuses: (statuses: Record<string, string[]>) => void;
  setPermissions: (perms: Record<string, { canEdit: boolean; canDelete: boolean; canCreate: boolean }>) => void;
  setAllPlacements: (placements: string[]) => void;
  setIntegrations: (integrations: Record<string, boolean>) => void;

  // Task actions
  updateTaskStatus: (taskId: string, newStatus: string) => void;
  updateTask: (updatedTask: Task) => void;
  deleteTask: (taskId: string) => void;
  addTask: (task: Task) => void;
  saveTask: (taskData: Partial<Task>, teams: Team[]) => void;
  reorderTaskInStatus: (taskId: string, targetTaskId: string, position: 'before' | 'after') => void;

  // Absence/Shift actions
  updateAbsence: (absence: Absence) => void;
  deleteAbsence: (id: string) => void;
  updateShift: (shift: Shift) => void;
  deleteShift: (id: string) => void;

  // Team actions
  addTeam: (team: Team) => void;
  deleteTeam: (id: string) => void;
  archiveTeam: (id: string) => void;
  saveTeamEdit: (id: string, newName: string, newIcon: string) => void;
  toggleTeamVisibility: (id: string) => void;
  toggleTeamAdminOnly: (id: string) => void;
  reorderTeams: (draggedId: string, targetId: string) => void;

  // Status/Type actions
  addStatus: (teamId: string, status: string) => void;
  deleteStatus: (teamId: string, status: string) => void;
  reorderStatuses: (teamId: string, newStatuses: string[]) => void;
  archiveStatus: (teamId: string, status: string) => void;
  duplicateStatus: (teamId: string, status: string, withData: boolean) => void;
  addType: (teamId: string, type: string) => void;
  deleteType: (teamId: string, type: string) => void;

  // Property actions
  addProperty: (teamId: string, property: CustomProperty) => void;
  updateProperty: (teamId: string, property: CustomProperty) => void;
  deleteProperty: (teamId: string, propertyId: string) => void;
  reorderProperties: (teamId: string, orderedIds: string[]) => void;

  // Permission actions
  togglePermission: (userId: string, type: 'canEdit' | 'canDelete' | 'canCreate') => void;

  // Member actions
  removeMember: (id: string, currentUserId: string) => void;
  updateMemberAvatar: (memberId: string, newAvatar: string) => void;

  // Integration actions
  toggleIntegration: (key: string, currentUserId: string) => void;

  // Load all data
  loadAllData: (authUserId: string) => Promise<Member | null>;
}

export const useDataStore = create<DataState>((set, get) => ({
  tasks: [],
  teams: [],
  members: [],
  absences: [],
  shifts: [],
  logs: [],
  teamStatuses: {},
  teamTypes: {},
  teamProperties: {},
  archivedStatuses: {},
  permissions: {},
  allPlacements: [],
  integrations: {},

  // Setters
  setTasks: (tasks) => set({ tasks }),
  setTeams: (teams) => set({ teams }),
  setMembers: (members) => set({ members }),
  setAbsences: (absences) => set({ absences }),
  setShifts: (shifts) => set({ shifts }),
  setLogs: (logs) => set({ logs }),
  setTeamStatuses: (statuses) => set({ teamStatuses: statuses }),
  setTeamTypes: (types) => set({ teamTypes: types }),
  setTeamProperties: (props) => set({ teamProperties: props }),
  setArchivedStatuses: (statuses) => set({ archivedStatuses: statuses }),
  setPermissions: (perms) => set({ permissions: perms }),
  setAllPlacements: (placements) => set({ allPlacements: placements }),
  setIntegrations: (integrations) => set({ integrations }),

  // Task actions
  updateTaskStatus: (taskId, newStatus) => {
    const prev = get().tasks;
    const task = prev.find((t) => t.id === taskId);
    set({ tasks: prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)) });
    db.updateTaskStatus(taskId, newStatus).catch(() => set({ tasks: prev }));

    // Notify all task assignees about status change
    if (task && task.assigneeIds.length > 0) {
      const actorName = getCurrentUserName();
      notifyMany(
        task.assigneeIds,
        'task_status_changed',
        `${actorName} changed "${task.title}" status to ${newStatus}`,
        { taskId, teamId: task.teamId },
      );
    }
  },

  updateTask: (updatedTask) => {
    const prev = get().tasks;
    const oldTask = prev.find((t) => t.id === updatedTask.id);
    set({ tasks: prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)) });
    db.upsertTask(updatedTask)
      .then(() => {
        db.syncTaskAssignees(updatedTask.id, updatedTask.assigneeIds);
        db.syncTaskPlacements(updatedTask.id, updatedTask.placements);
      })
      .catch(() => set({ tasks: prev }));

    // Notify newly added assignees
    if (oldTask) {
      const newAssignees = updatedTask.assigneeIds.filter((id) => !oldTask.assigneeIds.includes(id));
      if (newAssignees.length > 0) {
        const actorName = getCurrentUserName();
        notifyMany(newAssignees, 'task_assigned', `${actorName} assigned you to "${updatedTask.title}"`, {
          taskId: updatedTask.id,
          teamId: updatedTask.teamId,
        });
      }
    }
  },

  deleteTask: (taskId) => {
    const prev = get().tasks;
    set({ tasks: prev.filter((t) => t.id !== taskId) });
    db.deleteTask(taskId).catch(() => set({ tasks: prev }));
  },

  addTask: (task) => {
    set({ tasks: [...get().tasks, task] });
  },

  reorderTaskInStatus: (taskId, targetTaskId, position) => {
    const { tasks } = get();
    const task = tasks.find((t) => t.id === taskId);
    const targetTask = tasks.find((t) => t.id === targetTaskId);
    if (!task || !targetTask || task.status !== targetTask.status) return;

    // Get tasks in the same status, sorted by current sortOrder
    const statusTasks = tasks
      .filter((t) => t.status === task.status && t.teamId === task.teamId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    // Remove the dragged task
    const without = statusTasks.filter((t) => t.id !== taskId);
    // Find insert index
    const targetIdx = without.findIndex((t) => t.id === targetTaskId);
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    without.splice(insertIdx, 0, task);

    // Reassign sort orders
    const updates: { id: string; sort_order: number }[] = [];
    const updatedTasks = tasks.map((t) => {
      const idx = without.findIndex((w) => w.id === t.id);
      if (idx !== -1) {
        updates.push({ id: t.id, sort_order: idx });
        return { ...t, sortOrder: idx };
      }
      return t;
    });

    set({ tasks: updatedTasks });
    db.updateTaskSortOrders(updates).catch(() => set({ tasks }));
  },

  saveTask: (taskData, teams) => {
    if (!taskData.title) return;

    const isNew = !taskData.id;
    const newTask: Task = {
      id: taskData.id || crypto.randomUUID(),
      title: taskData.title!,
      description: taskData.description || '',
      teamId: taskData.teamId || teams[0]?.id || '',
      status: taskData.status || 'Not Started',
      priority: taskData.priority || 'medium',
      dueDate: taskData.dueDate || new Date().toISOString(),
      placements: taskData.placements || [],
      assigneeIds: taskData.assigneeIds || [],
      links: taskData.links || [],
      contentInfo: taskData.contentInfo || { type: 'Editorial', editorIds: [], designerIds: [] },
      customFieldValues: taskData.customFieldValues || {},
    };

    if (isNew) {
      set({ tasks: [...get().tasks, newTask] });
    } else {
      set({ tasks: get().tasks.map((t) => (t.id === newTask.id ? newTask : t)) });
    }

    db.upsertTask(newTask)
      .then(() => {
        db.syncTaskAssignees(newTask.id, newTask.assigneeIds);
        db.syncTaskPlacements(newTask.id, newTask.placements);
      })
      .catch(() => toast.error('Failed to save task'));
  },

  // Absence/Shift actions
  updateAbsence: (absence) => {
    const prev = get().absences;
    const existing = prev.find((a) => a.id === absence.id);
    const isNew = !existing;
    set({
      absences: existing ? prev.map((a) => (a.id === absence.id ? absence : a)) : [...prev, absence],
    });
    db.upsertAbsence(absence).catch(() => set({ absences: prev }));

    const { members } = get();
    const memberName = members.find((m) => m.id === absence.memberId)?.name || 'Someone';
    const actorName = getCurrentUserName();

    if (isNew) {
      // New absence submitted → notify all admins
      const adminIds = members.filter((m) => m.role === 'admin').map((m) => m.id);
      notifyMany(adminIds, 'absence_submitted', `${memberName} submitted a ${absence.type.replace('_', ' ')} request`, {
        absenceId: absence.id,
        memberId: absence.memberId,
      });
    } else if (existing && existing.approved !== absence.approved) {
      // Approval status changed → notify the absence owner
      const decision = absence.approved ? 'approved' : 'rejected';
      notify(
        absence.memberId,
        'absence_decided',
        `${actorName} ${decision} your ${absence.type.replace('_', ' ')} request`,
        { absenceId: absence.id },
      );
    }
  },

  deleteAbsence: (id) => {
    const prev = get().absences;
    set({ absences: prev.filter((a) => a.id !== id) });
    db.deleteAbsence(id).catch(() => set({ absences: prev }));
  },

  updateShift: (shift) => {
    const prev = get().shifts;
    set({
      shifts: prev.find((s) => s.id === shift.id) ? prev.map((s) => (s.id === shift.id ? shift : s)) : [...prev, shift],
    });
    db.upsertShift(shift).catch(() => set({ shifts: prev }));
  },

  deleteShift: (id) => {
    const prev = get().shifts;
    set({ shifts: prev.filter((s) => s.id !== id) });
    db.deleteShift(id).catch(() => set({ shifts: prev }));
  },

  // Team actions
  addTeam: (team) => {
    set({ teams: [...get().teams, team] });
    const { teamStatuses, teamTypes } = get();
    set({
      teamStatuses: { ...teamStatuses, [team.id]: ['To Do', 'In Progress', 'Done'] },
      teamTypes: { ...teamTypes, [team.id]: ['General'] },
    });

    db.upsertTeam(team)
      .then(() => {
        db.syncTeamStatuses(team.id, ['To Do', 'In Progress', 'Done']);
        db.syncTeamContentTypes(team.id, ['General']);
      })
      .catch(() => toast.error('Failed to create team'));
  },

  deleteTeam: (id) => {
    const prev = get().teams;
    set({ teams: prev.filter((t) => t.id !== id) });
    db.deleteTeam(id).catch(() => set({ teams: prev }));
  },

  archiveTeam: (id) => {
    const updatedTeams = get().teams.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t));
    set({ teams: updatedTeams });
    const team = updatedTeams.find((t) => t.id === id);
    if (team) db.upsertTeam(team).catch(() => toast.error('Failed to update team'));
  },

  saveTeamEdit: (id, newName, newIcon) => {
    const updatedTeams = get().teams.map((t) => (t.id === id ? { ...t, name: newName, icon: newIcon } : t));
    set({ teams: updatedTeams });
    const team = updatedTeams.find((t) => t.id === id);
    if (team) db.upsertTeam(team).catch(() => toast.error('Failed to save team changes'));
  },

  toggleTeamVisibility: (id) => {
    const updatedTeams = get().teams.map((t) => (t.id === id ? { ...t, hidden: !t.hidden } : t));
    set({ teams: updatedTeams });
    const team = updatedTeams.find((t) => t.id === id);
    if (team) db.upsertTeam(team).catch(() => toast.error('Failed to update team visibility'));
  },

  toggleTeamAdminOnly: (id) => {
    const updatedTeams = get().teams.map((t) => (t.id === id ? { ...t, adminOnly: !t.adminOnly } : t));
    set({ teams: updatedTeams });
    const team = updatedTeams.find((t) => t.id === id);
    if (team) db.upsertTeam(team).catch(() => toast.error('Failed to update team'));
  },

  reorderTeams: (draggedId, targetId) => {
    const { teams } = get();
    const draggedIndex = teams.findIndex((t) => t.id === draggedId);
    const targetIndex = teams.findIndex((t) => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTeams = [...teams];
    const [reorderedItem] = newTeams.splice(draggedIndex, 1);
    newTeams.splice(targetIndex, 0, reorderedItem);
    set({ teams: newTeams });
    db.updateTeamSortOrders(newTeams).catch(() => toast.error('Failed to reorder teams'));
  },

  // Status/Type actions
  addStatus: (teamId, status) => {
    if (!status) return;
    const { teamStatuses } = get();
    const newStatuses = [...(teamStatuses[teamId] || []), status];
    set({ teamStatuses: { ...teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses).catch(() => toast.error('Failed to save status'));
  },

  deleteStatus: (teamId, status) => {
    const { teamStatuses } = get();
    const newStatuses = (teamStatuses[teamId] || []).filter((s) => s !== status);
    set({ teamStatuses: { ...teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses).catch(() => toast.error('Failed to delete status'));
  },

  reorderStatuses: (teamId, newStatuses) => {
    set({ teamStatuses: { ...get().teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses).catch(() => toast.error('Failed to reorder statuses'));
  },

  archiveStatus: (teamId, status) => {
    const { archivedStatuses } = get();
    const currentArchived = archivedStatuses[teamId] || [];
    if (currentArchived.includes(status)) {
      set({ archivedStatuses: { ...archivedStatuses, [teamId]: currentArchived.filter((s) => s !== status) } });
    } else {
      set({ archivedStatuses: { ...archivedStatuses, [teamId]: [...currentArchived, status] } });
    }
  },

  duplicateStatus: (teamId, status, withData) => {
    const { teamStatuses, tasks } = get();
    const currentStatuses = teamStatuses[teamId] || teamStatuses['default'] || [];
    let uniqueName = `${status} Copy`;
    let counter = 1;
    while (currentStatuses.includes(uniqueName)) {
      uniqueName = `${status} Copy ${counter++}`;
    }

    const newStatuses = [...currentStatuses, uniqueName];
    set({ teamStatuses: { ...teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses).catch(() => toast.error('Failed to duplicate status'));

    if (withData) {
      const tasksToClone = tasks.filter((t) => t.teamId === teamId && t.status === status);
      const newTasks = tasksToClone.map((t) => ({
        ...t,
        id: crypto.randomUUID(),
        title: `${t.title} (Copy)`,
        status: uniqueName,
      }));
      set({ tasks: [...tasks, ...newTasks] });
      for (const task of newTasks) {
        db.upsertTask(task)
          .then(() => {
            db.syncTaskAssignees(task.id, task.assigneeIds);
            db.syncTaskPlacements(task.id, task.placements);
          })
          .catch(() => toast.error('Failed to clone task'));
      }
    }
  },

  addType: (teamId, type) => {
    if (!type) return;
    const { teamTypes } = get();
    const newTypes = [...(teamTypes[teamId] || []), type];
    set({ teamTypes: { ...teamTypes, [teamId]: newTypes } });
    db.syncTeamContentTypes(teamId, newTypes).catch(() => toast.error('Failed to save content type'));
  },

  deleteType: (teamId, type) => {
    const { teamTypes } = get();
    const newTypes = (teamTypes[teamId] || []).filter((t) => t !== type);
    set({ teamTypes: { ...teamTypes, [teamId]: newTypes } });
    db.syncTeamContentTypes(teamId, newTypes).catch(() => toast.error('Failed to delete content type'));
  },

  // Property actions
  addProperty: (teamId, property) => {
    const { teamProperties } = get();
    set({ teamProperties: { ...teamProperties, [teamId]: [...(teamProperties[teamId] || []), property] } });
    db.upsertCustomProperty(teamId, property).catch(() => toast.error('Failed to save property'));
  },

  updateProperty: (teamId, property) => {
    const { teamProperties } = get();
    set({
      teamProperties: {
        ...teamProperties,
        [teamId]: teamProperties[teamId].map((p) => (p.id === property.id ? property : p)),
      },
    });
    db.upsertCustomProperty(teamId, property).catch(() => toast.error('Failed to update property'));
  },

  deleteProperty: (teamId, propertyId) => {
    const { teamProperties } = get();
    set({
      teamProperties: { ...teamProperties, [teamId]: teamProperties[teamId].filter((p) => p.id !== propertyId) },
    });
    db.deleteCustomProperty(propertyId).catch(() => toast.error('Failed to delete property'));
  },

  reorderProperties: (teamId, orderedIds) => {
    const { teamProperties } = get();
    const props = teamProperties[teamId] || [];
    const reordered = orderedIds
      .map((id, i) => {
        const p = props.find((prop) => prop.id === id);
        return p ? { ...p, sortOrder: i } : null;
      })
      .filter(Boolean) as CustomProperty[];

    set({ teamProperties: { ...teamProperties, [teamId]: reordered } });
    const updates = reordered.map((p, i) => ({ id: p.id, sort_order: i }));
    db.updateCustomPropertySortOrders(updates).catch(() => toast.error('Failed to reorder properties'));
  },

  // Permission actions
  togglePermission: (userId, type) => {
    const { permissions } = get();
    const prev = permissions;
    const newPerms = {
      ...permissions,
      [userId]: { ...permissions[userId], [type]: !permissions[userId]?.[type] },
    };
    set({ permissions: newPerms });
    db.upsertPermission(userId, newPerms[userId]).catch(() => set({ permissions: prev }));
  },

  // Member actions
  removeMember: (id, currentUserId) => {
    const { members, logs } = get();
    const memberName = members.find((m) => m.id === id)?.name || 'Unknown';
    const prev = members;
    set({ members: members.filter((m) => m.id !== id) });
    db.deleteMember(id).catch(() => set({ members: prev }));

    const logEntry = {
      action: 'Member Removed',
      details: `Removed ${memberName} from the workspace`,
      userId: currentUserId,
      timestamp: new Date().toISOString(),
    };
    set({ logs: [{ id: crypto.randomUUID(), ...logEntry }, ...logs] });
    db.insertLog(logEntry).catch(() => {});
  },

  updateMemberAvatar: (memberId, newAvatar) => {
    const { members } = get();
    const updatedMembers = members.map((m) => (m.id === memberId ? { ...m, avatar: newAvatar } : m));
    set({ members: updatedMembers });
    const member = updatedMembers.find((m) => m.id === memberId);
    if (member) db.upsertMember(member).catch(() => toast.error('Failed to update avatar'));
  },

  // Integration actions
  toggleIntegration: (key, currentUserId) => {
    const { integrations, logs } = get();
    const newState = !integrations[key];
    const newIntegrations = { ...integrations, [key]: newState };
    set({ integrations: newIntegrations });
    db.updateIntegrations(newIntegrations).catch(() => toast.error('Failed to update integration'));

    const logEntry = {
      action: 'Integration Update',
      details: `${newState ? 'Connected' : 'Disconnected'} ${key.charAt(0).toUpperCase() + key.slice(1)}`,
      userId: currentUserId,
      timestamp: new Date().toISOString(),
    };
    set({ logs: [{ id: crypto.randomUUID(), ...logEntry }, ...logs] });
    db.insertLog(logEntry).catch(() => {});
  },

  // Load all data with resilient fetching
  loadAllData: async (authUserId) => {
    // Profile is critical - must succeed
    const profileResult = await db.findProfileByAuthId(authUserId);
    if (!profileResult) return null;

    // Use Promise.allSettled for remaining data - partial failure is OK
    const results = await Promise.allSettled([
      db.fetchTeams(),
      db.fetchTasks(),
      db.fetchMembers(),
      db.fetchAbsences(),
      db.fetchShifts(),
      db.fetchLogs(),
      db.fetchTeamStatuses(),
      db.fetchTeamContentTypes(),
      db.fetchPermissions(),
      db.fetchCustomProperties(),
      db.fetchPlacements(),
      db.fetchIntegrations(),
    ]);

    const getValue = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback;

    set({
      teams: getValue(results[0], []),
      tasks: getValue(results[1], []),
      members: getValue(results[2], []),
      absences: getValue(results[3], []),
      shifts: getValue(results[4], []),
      logs: getValue(results[5], []),
      teamStatuses: getValue(results[6], {}),
      teamTypes: getValue(results[7], {}),
      permissions: getValue(results[8], {}),
      teamProperties: getValue(results[9], {}),
      allPlacements: getValue(results[10], []),
      integrations: getValue(results[11], {}),
    });

    // Log any failures for debugging
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Data fetch [${i}] failed:`, r.reason);
      }
    });

    return profileResult;
  },
}));
