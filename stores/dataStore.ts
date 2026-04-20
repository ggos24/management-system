import { create } from 'zustand';
import { toast } from 'sonner';
import {
  Task,
  Team,
  Member,
  Absence,
  Shift,
  LogEntry,
  CustomProperty,
  TaskTeamLink,
  NotificationType,
  UserRole,
} from '../types';
import * as db from '../lib/database';
import { formatDateEU } from '../lib/utils';
import { useAuthStore } from './authStore';
import { supabase } from '../lib/supabase';

// === Notification helpers (fire-and-forget, non-critical) ===

function getCurrentUserId(): string | null {
  return useAuthStore.getState().currentUser?.id ?? null;
}

function getCurrentUserName(): string {
  return useAuthStore.getState().currentUser?.name ?? 'Someone';
}

function logAction(action: string, details: string, entityType: string) {
  const userId = getCurrentUserId();
  if (!userId) return;
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    action,
    details,
    userId,
    entityType,
    timestamp: new Date().toISOString(),
  };
  const { logs } = useDataStore.getState();
  useDataStore.setState({ logs: [entry, ...logs] });
  db.insertLog(entry).catch(() => {});
}

function logTaskActivity(
  taskId: string,
  entries: Array<{ field: string; oldValue?: string | null; newValue?: string | null }>,
) {
  const userId = getCurrentUserId();
  if (!userId || entries.length === 0) return;
  db.insertTaskActivity(entries.map((e) => ({ taskId, userId, ...e }))).catch(() => {});
}

function diffTaskFields(
  oldTask: Task,
  newTask: Task,
): Array<{ field: string; oldValue?: string | null; newValue?: string | null }> {
  const entries: Array<{ field: string; oldValue?: string | null; newValue?: string | null }> = [];
  if (oldTask.title !== newTask.title) {
    entries.push({ field: 'title', oldValue: oldTask.title, newValue: newTask.title });
  }
  // Status is intentionally excluded — updateTaskStatus logs it separately
  if (oldTask.priority !== newTask.priority) {
    entries.push({ field: 'priority', oldValue: oldTask.priority, newValue: newTask.priority });
  }
  if (oldTask.dueDate !== newTask.dueDate) {
    entries.push({ field: 'dueDate', oldValue: oldTask.dueDate || null, newValue: newTask.dueDate || null });
  }
  if (oldTask.description !== newTask.description) {
    entries.push({ field: 'description' });
  }
  if (JSON.stringify(oldTask.assigneeIds) !== JSON.stringify(newTask.assigneeIds)) {
    entries.push({
      field: 'assignees',
      oldValue: JSON.stringify(oldTask.assigneeIds),
      newValue: JSON.stringify(newTask.assigneeIds),
    });
  }
  if (JSON.stringify(oldTask.placements) !== JSON.stringify(newTask.placements)) {
    entries.push({
      field: 'placements',
      oldValue: JSON.stringify(oldTask.placements),
      newValue: JSON.stringify(newTask.placements),
    });
  }
  if (JSON.stringify(oldTask.contentInfo) !== JSON.stringify(newTask.contentInfo)) {
    entries.push({
      field: 'contentInfo',
      oldValue: JSON.stringify(oldTask.contentInfo),
      newValue: JSON.stringify(newTask.contentInfo),
    });
  }
  if (JSON.stringify(oldTask.customFieldValues) !== JSON.stringify(newTask.customFieldValues)) {
    entries.push({ field: 'customFields' });
  }
  return entries;
}

/** Collect all person IDs on a task (assignees + editors + designers + custom person fields), deduplicated. */
function getAllTaskPeople(task: Task): string[] {
  const ids = new Set<string>(task.assigneeIds);
  task.contentInfo?.editorIds?.forEach((id) => ids.add(id));
  task.contentInfo?.designerIds?.forEach((id) => ids.add(id));
  // Include custom person-type property values
  if (task.customFieldValues) {
    const allProps = useDataStore.getState().teamProperties;
    const props = allProps[task.teamId] || [];
    for (const prop of props) {
      if (prop.type === 'person') {
        const val = task.customFieldValues[prop.id];
        if (val && typeof val === 'string') ids.add(val);
      }
    }
  }
  return [...ids];
}

const PRIORITY_EMOJI: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };

function formatShortDate(iso: string): string {
  return formatDateEU(iso) || iso;
}

/** Build task context available at notification time */
function getTaskContext(entityData?: Record<string, any>) {
  if (!entityData) return null;
  const { teams, tasks } = useDataStore.getState();
  const task = entityData.taskId ? tasks.find((t) => t.id === entityData.taskId) : null;
  const teamName = entityData.teamId ? teams.find((t) => t.id === entityData.teamId)?.name : undefined;
  return { task, teamName };
}

function sendTelegram(recipientIds: string[], message: string, entityData?: Record<string, any>) {
  let text = message;
  const ctx = getTaskContext(entityData);

  if (ctx?.task || ctx?.teamName) {
    const details: string[] = [];
    if (ctx.teamName) details.push(`📁 ${ctx.teamName}`);
    if (ctx.task?.dueDate) details.push(`📅 Due: ${formatShortDate(ctx.task.dueDate)}`);
    const p = entityData?.priority || ctx.task?.priority;
    if (p) details.push(`${PRIORITY_EMOJI[p] || ''} Priority: ${p.charAt(0).toUpperCase() + p.slice(1)}`);
    if (ctx.task?.status) details.push(`📌 ${ctx.task.status}`);
    if (details.length > 0) text += '\n\n' + details.join('\n');
  } else if (entityData?.priority) {
    text += `\nPriority: ${PRIORITY_EMOJI[entityData.priority] || ''} ${entityData.priority}`;
  }

  const teamId = entityData?.teamId;
  const taskId = entityData?.taskId;
  const link = teamId ? `${window.location.origin}/teams/${teamId}${taskId ? `?task=${taskId}` : ''}` : undefined;
  supabase.functions.invoke('send-telegram', { body: { recipientIds, message: text, link } }).catch(console.error);
}

const EMAIL_SUBJECTS: Record<NotificationType, string> = {
  task_assigned: 'Task assigned to you',
  task_status_changed: 'Task status updated',
  task_updated: 'Task updated',
  task_unassigned: 'Task unassigned',
  task_deleted: 'Task deleted',
  absence_submitted: 'New absence request',
  absence_decided: 'Absence request decided',
  absence_cancelled: 'Absence cancelled',
  comment_mention: 'You were mentioned in a comment',
  schedule_updated: 'Schedule updated',
  member_invited: 'New member invited',
};

function sendEmail(recipientIds: string[], type: NotificationType, message: string, entityData?: Record<string, any>) {
  const subject = EMAIL_SUBJECTS[type];
  if (!subject) return;
  // Filter to recipients who have email notifications enabled
  const { members } = useDataStore.getState();
  const emailRecipients = recipientIds.filter((id) => {
    const member = members.find((m) => m.id === id);
    return member?.emailNotifications !== false;
  });
  if (emailRecipients.length === 0) return;

  const ctx = getTaskContext(entityData);
  const taskTitle = ctx?.task?.title;
  const fullSubject = taskTitle ? `${subject} — ${taskTitle}` : subject;

  const taskDetails =
    ctx?.task || ctx?.teamName
      ? {
          teamName: ctx.teamName,
          dueDate: ctx.task?.dueDate,
          priority: entityData?.priority || ctx.task?.priority,
          status: ctx.task?.status,
        }
      : undefined;

  const teamId = entityData?.teamId;
  const taskId = entityData?.taskId;
  const link = teamId ? `${window.location.origin}/teams/${teamId}${taskId ? `?task=${taskId}` : ''}` : undefined;
  supabase.functions
    .invoke('send-email', {
      body: { recipientIds: emailRecipients, subject: fullSubject, message, link, taskDetails },
    })
    .catch(console.error);
}

function notifyMany(recipientIds: string[], type: NotificationType, message: string, entityData?: Record<string, any>) {
  const actorId = getCurrentUserId();
  // Filter out self-notifications
  const recipients = recipientIds.filter((id) => id !== actorId);
  if (recipients.length === 0) return;
  db.insertNotifications(recipients.map((recipientId) => ({ recipientId, actorId, type, message, entityData }))).catch(
    console.error,
  );
  sendTelegram(recipients, message, entityData);
  sendEmail(recipients, type, message, entityData);
}

function notify(recipientId: string, type: NotificationType, message: string, entityData?: Record<string, any>) {
  const actorId = getCurrentUserId();
  if (recipientId === actorId) return; // Don't notify yourself
  db.insertNotification({ recipientId, actorId, type, message, entityData }).catch(console.error);
  sendTelegram([recipientId], message, entityData);
  sendEmail([recipientId], type, message, entityData);
}

interface DataState {
  tasks: Task[];
  teams: Team[];
  members: Member[];
  absences: Absence[];
  shifts: Shift[];
  logs: LogEntry[];
  teamStatuses: Record<string, string[]>;
  statusCategories: Record<string, Record<string, string>>;
  teamTypes: Record<string, string[]>;
  teamProperties: Record<string, CustomProperty[]>;
  permissions: Record<string, { canEdit: boolean; canDelete: boolean; canCreate: boolean }>;
  allPlacements: string[];
  teamPlacements: Record<string, string[]>;
  integrations: Record<string, boolean>;
  taskTeamLinks: TaskTeamLink[];
  deletedTasks: Task[];
  deletedTaskCount: number;
  sidebarTeamOrders: Record<string, number>;
  scheduleTeamOrders: Record<string, number>;
  teamHiddenColumns: Record<string, string[]>;

  // Setters
  setTaskTeamLinks: (links: TaskTeamLink[]) => void;
  setTasks: (tasks: Task[]) => void;
  setTeams: (teams: Team[]) => void;
  setMembers: (members: Member[]) => void;
  setAbsences: (absences: Absence[]) => void;
  setShifts: (shifts: Shift[]) => void;
  setLogs: (logs: LogEntry[]) => void;
  setTeamStatuses: (statuses: Record<string, string[]>) => void;
  setStatusCategories: (cats: Record<string, Record<string, string>>) => void;
  setTeamTypes: (types: Record<string, string[]>) => void;
  setTeamProperties: (props: Record<string, CustomProperty[]>) => void;
  setPermissions: (perms: Record<string, { canEdit: boolean; canDelete: boolean; canCreate: boolean }>) => void;
  setAllPlacements: (placements: string[]) => void;
  setTeamPlacements: (tp: Record<string, string[]>) => void;
  addPlacement: (name: string) => void;
  renamePlacement: (oldName: string, newName: string) => void;
  deletePlacement: (name: string) => void;
  addTeamPlacement: (teamId: string, name: string) => void;
  deleteTeamPlacement: (teamId: string, name: string) => void;
  renameTeamPlacement: (teamId: string, oldName: string, newName: string) => void;
  renameType: (teamId: string, oldName: string, newName: string) => void;
  setIntegrations: (integrations: Record<string, boolean>) => void;
  setDeletedTasks: (tasks: Task[]) => void;
  setDeletedTaskCount: (count: number) => void;
  setTeamHiddenColumns: (hidden: Record<string, string[]>) => void;

  // Column visibility actions (team-wide, editor+ only)
  hideTeamColumn: (teamId: string, columnKey: string) => void;
  showTeamColumn: (teamId: string, columnKey: string) => void;

  // Task team link actions
  linkTaskToTeam: (taskId: string, teamId: string) => void;
  unlinkTaskFromTeam: (taskId: string, teamId: string) => void;
  updateLinkedTaskStatus: (taskId: string, teamId: string, newStatus: string) => void;
  updateLinkedTaskFields: (taskId: string, teamId: string, values: Record<string, any>) => void;

  // Task actions
  updateTaskStatus: (taskId: string, newStatus: string, teamContext?: string) => void;
  updateTask: (updatedTask: Task) => void;
  deleteTask: (taskId: string) => void;
  addTask: (task: Task) => void;
  saveTask: (taskData: Partial<Task>, teams: Team[]) => void;
  reorderTaskInStatus: (taskId: string, targetTaskId: string, position: 'before' | 'after') => void;

  // Absence/Shift actions
  updateAbsence: (absence: Absence) => void;
  deleteAbsence: (id: string) => void;
  approveAbsence: (absenceId: string) => void;
  declineAbsence: (absenceId: string, reason?: string) => void;
  cancelAbsence: (absenceId: string) => void;
  updateShift: (shift: Shift) => void;
  deleteShift: (id: string) => void;

  // Team actions
  addTeam: (team: Team) => void;
  deleteTeam: (id: string) => void;
  archiveTeam: (id: string) => void;
  saveTeamEdit: (id: string, newName: string, newIcon: string) => void;
  toggleTeamVisibility: (id: string) => void;
  toggleTeamAdminOnly: (id: string) => void;
  toggleTeamRapidResponse: (id: string) => void;
  reorderSidebarTeams: (draggedId: string, targetId: string) => void;
  reorderScheduleTeams: (draggedId: string, targetId: string) => void;
  reorderTeamMembers: (teamId: string, draggedMemberId: string, targetMemberId: string) => void;

  // Status/Type actions
  addStatus: (teamId: string, status: string) => void;
  deleteStatus: (teamId: string, status: string) => void;
  reorderStatuses: (teamId: string, newStatuses: string[]) => void;
  duplicateStatus: (teamId: string, status: string, withData: boolean) => void;
  setStatusCategory: (teamId: string, statusName: string, category: string) => void;
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
  updateMemberName: (memberId: string, newName: string) => void;
  updateMemberJobTitle: (memberId: string, jobTitle: string) => void;
  updateMemberTeams: (memberId: string, nextTeamIds: string[]) => void;
  updateMemberRole: (memberId: string, role: UserRole) => void;

  // Integration actions
  toggleIntegration: (key: string, currentUserId: string) => void;

  // Bin actions
  restoreTask: (taskId: string) => void;
  permanentlyDeleteTask: (taskId: string) => void;
  emptyBin: () => void;
  loadDeletedTasks: () => Promise<void>;

  // Notification helpers
  notifyMention: (recipientIds: string[], actorName: string, taskTitle: string, taskId: string, teamId: string) => void;

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
  statusCategories: {},
  teamTypes: {},
  teamProperties: {},
  permissions: {},
  allPlacements: [],
  teamPlacements: {},
  integrations: {},
  taskTeamLinks: [],
  deletedTasks: [],
  deletedTaskCount: 0,
  sidebarTeamOrders: {},
  scheduleTeamOrders: {},
  teamHiddenColumns: {},

  // Setters
  setTaskTeamLinks: (links) => set({ taskTeamLinks: links }),
  setTasks: (tasks) => set({ tasks }),
  setTeams: (teams) => {
    const orders = get().sidebarTeamOrders;
    if (Object.keys(orders).length > 0) {
      teams.sort((a, b) => (orders[a.id] ?? 9999) - (orders[b.id] ?? 9999));
    }
    set({ teams });
  },
  setMembers: (members) => set({ members }),
  setAbsences: (absences) => set({ absences }),
  setShifts: (shifts) => set({ shifts }),
  setLogs: (logs) => set({ logs }),
  setTeamStatuses: (statuses) => set({ teamStatuses: statuses }),
  setStatusCategories: (cats: Record<string, Record<string, string>>) => set({ statusCategories: cats }),
  setTeamTypes: (types) => set({ teamTypes: types }),
  setTeamProperties: (props) => set({ teamProperties: props }),
  setPermissions: (perms) => set({ permissions: perms }),
  setAllPlacements: (placements) => set({ allPlacements: placements }),
  setTeamPlacements: (tp) => set({ teamPlacements: tp }),
  addPlacement: (name) => {
    const { allPlacements } = get();
    if (allPlacements.includes(name)) return;
    set({ allPlacements: [...allPlacements, name] });
    db.addPlacement(name).catch(() => toast.error('Failed to add placement'));
  },
  renamePlacement: (oldName, newName) => {
    const { allPlacements, tasks } = get();
    set({
      allPlacements: allPlacements.map((p) => (p === oldName ? newName : p)),
      tasks: tasks.map((t) => ({
        ...t,
        placements: t.placements.map((p) => (p === oldName ? newName : p)),
      })),
    });
    db.renamePlacement(oldName, newName).catch(() => toast.error('Failed to rename placement'));
  },
  deletePlacement: (name) => {
    const { allPlacements, tasks } = get();
    set({
      allPlacements: allPlacements.filter((p) => p !== name),
      tasks: tasks.map((t) => ({
        ...t,
        placements: t.placements.filter((p) => p !== name),
      })),
    });
    db.deletePlacement(name).catch(() => toast.error('Failed to delete placement'));
  },
  addTeamPlacement: (teamId, name) => {
    const { teamPlacements } = get();
    const current = teamPlacements[teamId] || [];
    if (current.includes(name)) return;
    set({ teamPlacements: { ...teamPlacements, [teamId]: [...current, name] } });
    db.syncTeamPlacements(teamId, [...current, name]).catch(() => toast.error('Failed to add placement'));
  },
  deleteTeamPlacement: (teamId, name) => {
    const { teamPlacements } = get();
    const current = teamPlacements[teamId] || [];
    const updated = current.filter((p) => p !== name);
    set({ teamPlacements: { ...teamPlacements, [teamId]: updated } });
    db.syncTeamPlacements(teamId, updated).catch(() => toast.error('Failed to delete placement'));
  },
  renameTeamPlacement: (teamId, oldName, newName) => {
    const { teamPlacements, tasks } = get();
    const current = teamPlacements[teamId] || [];
    const updated = current.map((p) => (p === oldName ? newName : p));
    set({
      teamPlacements: { ...teamPlacements, [teamId]: updated },
      tasks: tasks.map((t) =>
        t.teamId === teamId ? { ...t, placements: t.placements.map((p) => (p === oldName ? newName : p)) } : t,
      ),
    });
    db.syncTeamPlacements(teamId, updated).catch(() => toast.error('Failed to rename placement'));
    // Also rename in global placements table for task persistence
    db.renamePlacement(oldName, newName).catch(console.error);
  },
  renameType: (teamId, oldName, newName) => {
    const { teamTypes, tasks } = get();
    const current = teamTypes[teamId] || [];
    const updated = current.map((t) => (t === oldName ? newName : t));
    set({
      teamTypes: { ...teamTypes, [teamId]: updated },
      tasks: tasks.map((t) =>
        t.teamId === teamId && t.contentInfo?.type === oldName
          ? { ...t, contentInfo: { ...t.contentInfo, type: newName } }
          : t,
      ),
    });
    db.syncTeamContentTypes(teamId, updated).catch(() => toast.error('Failed to rename content type'));
  },
  setIntegrations: (integrations) => set({ integrations }),
  setDeletedTasks: (deletedTasks) => set({ deletedTasks }),
  setDeletedTaskCount: (deletedTaskCount) => set({ deletedTaskCount }),
  setTeamHiddenColumns: (hidden) => set({ teamHiddenColumns: hidden }),

  hideTeamColumn: (teamId, columnKey) => {
    const prev = get().teamHiddenColumns;
    const prevKeys = prev[teamId] || [];
    if (prevKeys.includes(columnKey)) return;
    const nextKeys = [...prevKeys, columnKey];
    set({ teamHiddenColumns: { ...prev, [teamId]: nextKeys } });
    const actorId = getCurrentUserId();
    db.hideTeamColumn(teamId, columnKey, actorId).catch(() => {
      set({ teamHiddenColumns: prev });
      toast.error('Failed to hide column');
    });
  },

  showTeamColumn: (teamId, columnKey) => {
    const prev = get().teamHiddenColumns;
    const prevKeys = prev[teamId] || [];
    if (!prevKeys.includes(columnKey)) return;
    const nextKeys = prevKeys.filter((k) => k !== columnKey);
    const nextMap = { ...prev };
    if (nextKeys.length === 0) delete nextMap[teamId];
    else nextMap[teamId] = nextKeys;
    set({ teamHiddenColumns: nextMap });
    db.showTeamColumn(teamId, columnKey).catch(() => {
      set({ teamHiddenColumns: prev });
      toast.error('Failed to show column');
    });
  },

  // Task team link actions
  linkTaskToTeam: (taskId, teamId) => {
    const { taskTeamLinks, teamStatuses, statusCategories } = get();
    const statuses = teamStatuses[teamId] || [];
    const defaultStatus = 'Backlog';
    if (!statuses.includes('Backlog')) {
      const newStatuses = ['Backlog', ...statuses];
      const newCats = { ...(statusCategories[teamId] || {}), Backlog: 'backlog' };
      set({
        teamStatuses: { ...get().teamStatuses, [teamId]: newStatuses },
        statusCategories: { ...get().statusCategories, [teamId]: newCats },
      });
      db.syncTeamStatuses(teamId, newStatuses, newCats).catch(console.error);
    }
    const addedBy = getCurrentUserId() || undefined;
    const optimisticLink: TaskTeamLink = {
      id: crypto.randomUUID(),
      taskId,
      teamId,
      status: defaultStatus,
      sortOrder: 0,
      customFieldValues: {},
      addedBy,
      createdAt: new Date().toISOString(),
    };
    set({ taskTeamLinks: [...taskTeamLinks, optimisticLink] });
    db.insertTaskTeamLink(taskId, teamId, defaultStatus, addedBy).catch(() => {
      set({ taskTeamLinks: get().taskTeamLinks.filter((l) => l.id !== optimisticLink.id) });
      toast.error('Failed to link task');
    });
  },

  unlinkTaskFromTeam: (taskId, teamId) => {
    const prev = get().taskTeamLinks;
    set({ taskTeamLinks: prev.filter((l) => !(l.taskId === taskId && l.teamId === teamId)) });
    db.deleteTaskTeamLink(taskId, teamId).catch(() => {
      set({ taskTeamLinks: prev });
      toast.error('Failed to unlink task');
    });
  },

  updateLinkedTaskStatus: (taskId, teamId, newStatus) => {
    const prev = get().taskTeamLinks;
    set({
      taskTeamLinks: prev.map((l) => (l.taskId === taskId && l.teamId === teamId ? { ...l, status: newStatus } : l)),
    });
    db.updateTaskTeamLinkStatus(taskId, teamId, newStatus).catch(() => set({ taskTeamLinks: prev }));
  },

  updateLinkedTaskFields: (taskId, teamId, values) => {
    const prev = get().taskTeamLinks;
    set({
      taskTeamLinks: prev.map((l) =>
        l.taskId === taskId && l.teamId === teamId ? { ...l, customFieldValues: values } : l,
      ),
    });
    db.updateTaskTeamLinkFields(taskId, teamId, values).catch(() => set({ taskTeamLinks: prev }));
  },

  // Task actions
  updateTaskStatus: (taskId, newStatus, teamContext?) => {
    // If teamContext is provided and differs from the task's home team, update the link instead
    if (teamContext && teamContext !== 'my-work') {
      const task = get().tasks.find((t) => t.id === taskId);
      if (task && task.teamId !== teamContext) {
        const link = get().taskTeamLinks.find((l) => l.taskId === taskId && l.teamId === teamContext);
        if (link) {
          get().updateLinkedTaskStatus(taskId, teamContext, newStatus);
          return;
        }
      }
    }
    const prev = get().tasks;
    const task = prev.find((t) => t.id === taskId);
    if (task && task.status === newStatus) return; // Same status, no-op
    set({ tasks: prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)) });
    db.updateTaskStatus(taskId, newStatus).catch(() => set({ tasks: prev }));
    if (task) {
      logAction('Task Status Changed', `Moved "${task.title}" to ${newStatus}`, 'task');
      logTaskActivity(taskId, [{ field: 'status', oldValue: task.status, newValue: newStatus }]);
    }

    // Notify all people on task about status change
    const statusPeople = task ? getAllTaskPeople(task) : [];
    if (task && statusPeople.length > 0) {
      const actorName = getCurrentUserName();
      notifyMany(statusPeople, 'task_status_changed', `${actorName} changed "${task.title}" status to ${newStatus}`, {
        taskId,
        teamId: task.teamId,
        priority: task.priority,
      });
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

    // Log activity
    if (oldTask) logTaskActivity(updatedTask.id, diffTaskFields(oldTask, updatedTask));

    // Notify all people (assignees + editors + designers) about changes
    if (oldTask) {
      const actorName = getCurrentUserName();
      const allNewPeople = getAllTaskPeople(updatedTask);
      const allOldPeople = getAllTaskPeople(oldTask);

      // Notify newly added people
      const newPeople = allNewPeople.filter((id) => !allOldPeople.includes(id));
      if (newPeople.length > 0) {
        notifyMany(newPeople, 'task_assigned', `${actorName} assigned you to "${updatedTask.title}"`, {
          taskId: updatedTask.id,
          teamId: updatedTask.teamId,
          priority: updatedTask.priority,
        });
      }

      // Notify removed people
      const removedPeople = allOldPeople.filter((id) => !allNewPeople.includes(id));
      if (removedPeople.length > 0) {
        notifyMany(removedPeople, 'task_unassigned', `${actorName} removed you from "${updatedTask.title}"`, {
          taskId: updatedTask.id,
          teamId: updatedTask.teamId,
          priority: updatedTask.priority,
        });
      }

      // Detect meaningful field changes and notify all current people
      const changes: string[] = [];
      if (oldTask.title !== updatedTask.title) changes.push('title');
      if (oldTask.priority !== updatedTask.priority) changes.push('priority');
      if (oldTask.dueDate !== updatedTask.dueDate) changes.push('due date');
      if (oldTask.description !== updatedTask.description) changes.push('description');
      if (JSON.stringify(oldTask.placements) !== JSON.stringify(updatedTask.placements)) changes.push('placements');
      if (JSON.stringify(oldTask.customFieldValues) !== JSON.stringify(updatedTask.customFieldValues))
        changes.push('fields');

      if (changes.length > 0 && allNewPeople.length > 0) {
        const updateRecipients = allNewPeople.filter((id) => !newPeople.includes(id));
        if (updateRecipients.length > 0) {
          notifyMany(
            updateRecipients,
            'task_updated',
            `${actorName} updated ${changes.join(', ')} on "${updatedTask.title}"`,
            { taskId: updatedTask.id, teamId: updatedTask.teamId, priority: updatedTask.priority },
          );
        }
      }
    }
  },

  deleteTask: (taskId) => {
    const snapshot = get();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const userId = getCurrentUserId();

    // Optimistically move to deleted
    const deletedTask = { ...task, deletedAt: new Date().toISOString(), deletedBy: userId };
    set({
      tasks: snapshot.tasks.filter((t) => t.id !== taskId),
      deletedTasks: [deletedTask, ...snapshot.deletedTasks],
      deletedTaskCount: snapshot.deletedTaskCount + 1,
    });

    logAction('Task Deleted', `Deleted task "${task.title}"`, 'task');
    logTaskActivity(taskId, [{ field: 'deleted' }]);

    if (!userId) return;
    db.softDeleteTask(taskId, userId).catch(() => {
      set({
        tasks: snapshot.tasks,
        deletedTasks: snapshot.deletedTasks,
        deletedTaskCount: snapshot.deletedTaskCount,
      });
    });

    // Notify all people on task about deletion
    const deletePeople = getAllTaskPeople(task);
    if (deletePeople.length > 0) {
      const actorName = getCurrentUserName();
      notifyMany(deletePeople, 'task_deleted', `${actorName} deleted "${task.title}"`, {
        teamId: task.teamId,
      });
    }

    toast('Task moved to bin', {
      action: {
        label: 'Undo',
        onClick: () => {
          get().restoreTask(taskId);
        },
      },
    });
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
    const withoutMap = new Map(without.map((w, i) => [w.id, i]));
    const updates: { id: string; sort_order: number }[] = [];
    const updatedTasks = tasks.map((t) => {
      const idx = withoutMap.get(t.id);
      if (idx !== undefined) {
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

    const existingTask = taskData.id ? get().tasks.find((t) => t.id === taskData.id) : null;
    const isNew = !existingTask;
    const newTask: Task = {
      id: taskData.id || crypto.randomUUID(),
      title: taskData.title!,
      description: taskData.description || '',
      teamId: taskData.teamId || teams[0]?.id || '',
      status: taskData.status || 'Not Started',
      priority: taskData.priority || 'medium',
      dueDate: taskData.dueDate || new Date().toISOString(),
      doneDate: taskData.doneDate || null,
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

    if (isNew) {
      logAction('Task Created', `Created task "${newTask.title}"`, 'task');
      logTaskActivity(newTask.id, [{ field: 'created' }]);
    } else {
      logAction('Task Updated', `Updated task "${newTask.title}"`, 'task');
      if (existingTask) logTaskActivity(newTask.id, diffTaskFields(existingTask, newTask));
    }

    const actorName = getCurrentUserName();
    const allNewPeople = getAllTaskPeople(newTask);

    if (isNew) {
      // Notify all people on a new task (assignees + editors + designers)
      if (allNewPeople.length > 0) {
        notifyMany(allNewPeople, 'task_assigned', `${actorName} assigned you to "${newTask.title}"`, {
          taskId: newTask.id,
          teamId: newTask.teamId,
          priority: newTask.priority,
        });
      }
    } else if (existingTask) {
      const allOldPeople = getAllTaskPeople(existingTask);

      // Notify newly added people
      const newPeople = allNewPeople.filter((id) => !allOldPeople.includes(id));
      if (newPeople.length > 0) {
        notifyMany(newPeople, 'task_assigned', `${actorName} assigned you to "${newTask.title}"`, {
          taskId: newTask.id,
          teamId: newTask.teamId,
          priority: newTask.priority,
        });
      }

      // Notify removed people
      const removedPeople = allOldPeople.filter((id) => !allNewPeople.includes(id));
      if (removedPeople.length > 0) {
        notifyMany(removedPeople, 'task_unassigned', `${actorName} removed you from "${newTask.title}"`, {
          taskId: newTask.id,
          teamId: newTask.teamId,
          priority: newTask.priority,
        });
      }

      const changes: string[] = [];
      if (existingTask.title !== newTask.title) changes.push('title');
      if (existingTask.priority !== newTask.priority) changes.push('priority');
      if (existingTask.dueDate !== newTask.dueDate) changes.push('due date');
      if (existingTask.description !== newTask.description) changes.push('description');
      if (JSON.stringify(existingTask.placements) !== JSON.stringify(newTask.placements)) changes.push('placements');
      if (JSON.stringify(existingTask.customFieldValues) !== JSON.stringify(newTask.customFieldValues))
        changes.push('fields');

      if (changes.length > 0 && allNewPeople.length > 0) {
        const updateRecipients = allNewPeople.filter((id) => !newPeople.includes(id));
        if (updateRecipients.length > 0) {
          notifyMany(
            updateRecipients,
            'task_updated',
            `${actorName} updated ${changes.join(', ')} on "${newTask.title}"`,
            { taskId: newTask.id, teamId: newTask.teamId, priority: newTask.priority },
          );
        }
      }
    }
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

    const currentUserId = getCurrentUserId();
    const actorName = getCurrentUserName();
    const isOwnAbsence = absence.memberId === currentUserId;

    if (isNew && isOwnAbsence) {
      // User submitted their own absence → notify all admins
      const adminIds = members.filter((m) => m.role === 'admin').map((m) => m.id);
      notifyMany(adminIds, 'absence_submitted', `${memberName} submitted a ${absence.type.replace('_', ' ')} request`, {
        absenceId: absence.id,
        memberId: absence.memberId,
      });
    } else if (!isOwnAbsence) {
      // Admin created/edited absence for another user → notify that user
      const action = isNew ? 'added' : 'updated';
      notify(
        absence.memberId,
        'schedule_updated',
        `${actorName} ${action} a ${absence.type.replace('_', ' ')} on your schedule`,
        { absenceId: absence.id, memberId: absence.memberId },
      );
    }
  },

  deleteAbsence: (id) => {
    const prev = get().absences;
    set({ absences: prev.filter((a) => a.id !== id) });
    db.deleteAbsence(id).catch(() => set({ absences: prev }));
  },

  approveAbsence: (absenceId) => {
    const prev = get().absences;
    const absence = prev.find((a) => a.id === absenceId);
    if (!absence) return;
    const userId = getCurrentUserId();
    const actorName = getCurrentUserName();

    set({
      absences: prev.map((a) =>
        a.id === absenceId
          ? { ...a, status: 'approved' as const, decidedBy: userId, decidedAt: new Date().toISOString() }
          : a,
      ),
    });
    if (!userId) return;
    db.updateAbsenceDecision(absenceId, 'approved', userId).catch(() => set({ absences: prev }));

    const { members: m1 } = get();
    const approvedName = m1.find((m) => m.id === absence.memberId)?.name || 'someone';
    logAction('Absence Approved', `Approved ${absence.type.replace('_', ' ')} for ${approvedName}`, 'schedule');

    notify(
      absence.memberId,
      'absence_decided',
      `${actorName} approved your ${absence.type.replace('_', ' ')} request`,
      { absenceId },
    );
  },

  declineAbsence: (absenceId, reason) => {
    const prev = get().absences;
    const absence = prev.find((a) => a.id === absenceId);
    if (!absence) return;
    const userId = getCurrentUserId();
    const actorName = getCurrentUserName();

    set({
      absences: prev.map((a) =>
        a.id === absenceId
          ? {
              ...a,
              status: 'declined' as const,
              decidedBy: userId,
              decidedAt: new Date().toISOString(),
              declineReason: reason || null,
            }
          : a,
      ),
    });
    if (!userId) return;
    db.updateAbsenceDecision(absenceId, 'declined', userId, reason).catch(() => set({ absences: prev }));

    const { members: m2 } = get();
    const declinedName = m2.find((m) => m.id === absence.memberId)?.name || 'someone';
    logAction('Absence Declined', `Declined ${absence.type.replace('_', ' ')} for ${declinedName}`, 'schedule');

    notify(
      absence.memberId,
      'absence_decided',
      `${actorName} declined your ${absence.type.replace('_', ' ')} request`,
      { absenceId, reason },
    );
  },

  cancelAbsence: (absenceId) => {
    const prev = get().absences;
    const absence = prev.find((a) => a.id === absenceId);
    if (!absence) return;

    set({ absences: prev.filter((a) => a.id !== absenceId) });
    db.deleteAbsence(absenceId).catch(() => set({ absences: prev }));

    const { members } = get();
    const memberName = getCurrentUserName();
    const adminIds = members.filter((m) => m.role === 'admin').map((m) => m.id);
    notifyMany(
      adminIds,
      'absence_cancelled',
      `${memberName} cancelled their ${absence.type.replace('_', ' ')} request`,
      { absenceId, memberId: absence.memberId },
    );
  },

  updateShift: (shift) => {
    const prev = get().shifts;
    set({
      shifts: prev.find((s) => s.id === shift.id) ? prev.map((s) => (s.id === shift.id ? shift : s)) : [...prev, shift],
    });
    db.upsertShift(shift).catch(() => set({ shifts: prev }));

    // Notify user when admin updates their shift
    const currentUserId = getCurrentUserId();
    if (shift.memberId !== currentUserId) {
      const actorName = getCurrentUserName();
      notify(shift.memberId, 'schedule_updated', `${actorName} updated your shift schedule`, {
        memberId: shift.memberId,
      });
    }
  },

  deleteShift: (id) => {
    const prev = get().shifts;
    set({ shifts: prev.filter((s) => s.id !== id) });
    db.deleteShift(id).catch(() => set({ shifts: prev }));
  },

  // Team actions
  addTeam: (team) => {
    set({ teams: [...get().teams, team] });
    const { teamStatuses, statusCategories, teamTypes } = get();
    const defaultCats = { Backlog: 'backlog' };
    set({
      teamStatuses: { ...teamStatuses, [team.id]: ['Backlog', 'To Do', 'In Progress', 'Done'] },
      statusCategories: { ...statusCategories, [team.id]: defaultCats },
      teamTypes: { ...teamTypes, [team.id]: ['General'] },
    });

    db.upsertTeam(team)
      .then(() => {
        db.syncTeamStatuses(team.id, ['Backlog', 'To Do', 'In Progress', 'Done'], defaultCats);
        db.syncTeamContentTypes(team.id, ['General']);
      })
      .catch(() => toast.error('Failed to create team'));
    logAction('Team Created', `Created team "${team.name}"`, 'team');
  },

  deleteTeam: (id) => {
    const prev = get().teams;
    const teamName = prev.find((t) => t.id === id)?.name || 'Unknown';
    set({ teams: prev.filter((t) => t.id !== id) });
    db.deleteTeam(id).catch(() => set({ teams: prev }));
    logAction('Team Deleted', `Deleted team "${teamName}"`, 'team');
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
    logAction('Team Updated', `Updated team "${newName}"`, 'team');
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

  toggleTeamRapidResponse: (id) => {
    const updatedTeams = get().teams.map((t) => (t.id === id ? { ...t, rapidResponse: !t.rapidResponse } : t));
    set({ teams: updatedTeams });
    const team = updatedTeams.find((t) => t.id === id);
    if (team) db.upsertTeam(team).catch(() => toast.error('Failed to update team'));
  },

  reorderSidebarTeams: (draggedId, targetId) => {
    const { teams } = get();
    const draggedIndex = teams.findIndex((t) => t.id === draggedId);
    const targetIndex = teams.findIndex((t) => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTeams = [...teams];
    const [reorderedItem] = newTeams.splice(draggedIndex, 1);
    newTeams.splice(targetIndex, 0, reorderedItem);

    const newOrders: Record<string, number> = {};
    const orderRows = newTeams.map((t, i) => {
      newOrders[t.id] = i;
      return { teamId: t.id, sortOrder: i };
    });

    set({ teams: newTeams, sidebarTeamOrders: newOrders });

    const userId = getCurrentUserId();
    if (userId) {
      db.upsertUserTeamOrders(userId, orderRows, 'sidebar').catch(() => toast.error('Failed to reorder teams'));
    }
  },

  reorderScheduleTeams: (draggedId, targetId) => {
    const { scheduleTeamOrders, teams } = get();
    // Build a schedule-sorted copy to find indices
    const scheduleTeams = [...teams];
    if (Object.keys(scheduleTeamOrders).length > 0) {
      scheduleTeams.sort((a, b) => (scheduleTeamOrders[a.id] ?? 9999) - (scheduleTeamOrders[b.id] ?? 9999));
    }

    const draggedIndex = scheduleTeams.findIndex((t) => t.id === draggedId);
    const targetIndex = scheduleTeams.findIndex((t) => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...scheduleTeams];
    const [item] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, item);

    const newOrders: Record<string, number> = {};
    const orderRows = reordered.map((t, i) => {
      newOrders[t.id] = i;
      return { teamId: t.id, sortOrder: i };
    });

    set({ scheduleTeamOrders: newOrders });

    const userId = getCurrentUserId();
    if (userId) {
      db.upsertUserTeamOrders(userId, orderRows, 'schedule').catch(() => toast.error('Failed to reorder teams'));
    }
  },

  reorderTeamMembers: (teamId: string, draggedMemberId: string, targetMemberId: string) => {
    const { members } = get();
    const teamMembers = members.filter((m) => m.teamIds.includes(teamId));
    const otherMembers = members.filter((m) => !m.teamIds.includes(teamId));

    const draggedIndex = teamMembers.findIndex((m) => m.id === draggedMemberId);
    const targetIndex = teamMembers.findIndex((m) => m.id === targetMemberId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...teamMembers];
    const [item] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, item);

    const orderRows = reordered.map((m, i) => ({ memberId: m.id, sortOrder: i }));
    const updatedTeamMembers = reordered.map((m, i) => ({ ...m, scheduleSortOrder: i }));

    set({ members: [...otherMembers, ...updatedTeamMembers] });

    db.updateMemberScheduleOrders(orderRows).catch(() => toast.error('Failed to reorder members'));
  },

  // Status/Type actions
  addStatus: (teamId, status) => {
    if (!status) return;
    const { teamStatuses, statusCategories } = get();
    const newStatuses = [...(teamStatuses[teamId] || []), status];
    set({ teamStatuses: { ...teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses, statusCategories[teamId]).catch(() =>
      toast.error('Failed to save status'),
    );
  },

  deleteStatus: (teamId, status) => {
    const { teamStatuses, statusCategories } = get();
    const newStatuses = (teamStatuses[teamId] || []).filter((s) => s !== status);
    set({ teamStatuses: { ...teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses, statusCategories[teamId]).catch(() =>
      toast.error('Failed to delete status'),
    );
  },

  reorderStatuses: (teamId, newStatuses) => {
    set({ teamStatuses: { ...get().teamStatuses, [teamId]: newStatuses } });
    db.syncTeamStatuses(teamId, newStatuses, get().statusCategories[teamId]).catch(() =>
      toast.error('Failed to reorder statuses'),
    );
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
    db.syncTeamStatuses(teamId, newStatuses, get().statusCategories[teamId]).catch(() =>
      toast.error('Failed to duplicate status'),
    );

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

  setStatusCategory: (teamId, statusName, category) => {
    const { statusCategories } = get();
    const teamCats = { ...(statusCategories[teamId] || {}) };

    // Only one status per non-active category — reset previous holder
    if (category !== 'active') {
      for (const [name, cat] of Object.entries(teamCats)) {
        if (cat === category && name !== statusName) {
          teamCats[name] = 'active';
          db.updateStatusCategory(teamId, name, 'active').catch(console.error);
        }
      }
    }

    teamCats[statusName] = category;
    set({ statusCategories: { ...statusCategories, [teamId]: teamCats } });
    db.updateStatusCategory(teamId, statusName, category).catch(() => toast.error('Failed to update status category'));
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
    const prev = teamProperties;
    set({ teamProperties: { ...teamProperties, [teamId]: [...(teamProperties[teamId] || []), property] } });
    db.upsertCustomProperty(teamId, property).catch(() => {
      set({ teamProperties: prev });
      toast.error('Failed to save property');
    });
  },

  updateProperty: (teamId, property) => {
    const { teamProperties } = get();
    const prev = teamProperties;
    set({
      teamProperties: {
        ...teamProperties,
        [teamId]: (teamProperties[teamId] || []).map((p) => (p.id === property.id ? property : p)),
      },
    });
    db.upsertCustomProperty(teamId, property).catch(() => {
      set({ teamProperties: prev });
      toast.error('Failed to update property');
    });
  },

  deleteProperty: (teamId, propertyId) => {
    const { teamProperties } = get();
    const prev = teamProperties;
    set({
      teamProperties: {
        ...teamProperties,
        [teamId]: (teamProperties[teamId] || []).filter((p) => p.id !== propertyId),
      },
    });
    db.deleteCustomProperty(propertyId).catch(() => {
      set({ teamProperties: prev });
      toast.error('Failed to delete property');
    });
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
    const { permissions, members } = get();
    const prev = permissions;
    const newVal = !permissions[userId]?.[type];
    const newPerms = {
      ...permissions,
      [userId]: { ...permissions[userId], [type]: newVal },
    };
    set({ permissions: newPerms });
    db.upsertPermission(userId, newPerms[userId]).catch(() => set({ permissions: prev }));
    const memberName = members.find((m) => m.id === userId)?.name || 'Unknown';
    const permLabel = type.replace('can', '').toLowerCase();
    logAction('Permission Changed', `${newVal ? 'Granted' : 'Revoked'} ${permLabel} for ${memberName}`, 'permission');
  },

  // Member actions
  removeMember: (id, _currentUserId) => {
    const { members } = get();
    const memberName = members.find((m) => m.id === id)?.name || 'Unknown';
    const prev = members;
    set({ members: members.filter((m) => m.id !== id) });
    db.deleteMember(id).catch(() => set({ members: prev }));
    logAction('Member Removed', `Removed ${memberName} from the workspace`, 'member');
  },

  updateMemberAvatar: (memberId, newAvatar) => {
    // Only update local state — the DB write already happened in uploadAvatar()
    const { members } = get();
    const updatedMembers = members.map((m) => (m.id === memberId ? { ...m, avatar: newAvatar } : m));
    set({ members: updatedMembers });
  },

  updateMemberTeams: (memberId, nextTeamIds) => {
    const { members } = get();
    const prev = members;
    const primary = nextTeamIds[0] || '';
    const updatedMembers = members.map((m) =>
      m.id === memberId ? { ...m, teamId: primary, teamIds: nextTeamIds } : m,
    );
    set({ members: updatedMembers });
    db.setProfileTeams(memberId, nextTeamIds).catch(() => {
      set({ members: prev });
      toast.error('Failed to update teams');
    });
  },

  updateMemberName: (memberId, newName) => {
    const { members } = get();
    const updatedMembers = members.map((m) => (m.id === memberId ? { ...m, name: newName } : m));
    set({ members: updatedMembers });
    db.updateProfileName(memberId, newName).catch(() => toast.error('Failed to update name'));
  },

  updateMemberJobTitle: (memberId, jobTitle) => {
    const { members } = get();
    const updatedMembers = members.map((m) => (m.id === memberId ? { ...m, jobTitle } : m));
    set({ members: updatedMembers });
    db.updateProfileJobTitle(memberId, jobTitle).catch(() => toast.error('Failed to update job title'));
  },

  updateMemberRole: (memberId, role) => {
    const { members } = get();
    const updatedMembers = members.map((m) => (m.id === memberId ? { ...m, role } : m));
    set({ members: updatedMembers });
    db.updateProfileRole(memberId, role).catch(() => toast.error('Failed to update role'));
  },

  // Integration actions
  toggleIntegration: (key, _currentUserId) => {
    const { integrations } = get();
    const newState = !integrations[key];
    const newIntegrations = { ...integrations, [key]: newState };
    set({ integrations: newIntegrations });
    db.updateIntegrations(newIntegrations).catch(() => toast.error('Failed to update integration'));
    logAction(
      'Integration Update',
      `${newState ? 'Connected' : 'Disconnected'} ${key.charAt(0).toUpperCase() + key.slice(1)}`,
      'integration',
    );
  },

  // Bin actions
  restoreTask: (taskId) => {
    const snapshot = get();
    const task = snapshot.deletedTasks.find((t) => t.id === taskId);
    if (!task) return;

    const restored = { ...task, deletedAt: null, deletedBy: null };
    set({
      deletedTasks: snapshot.deletedTasks.filter((t) => t.id !== taskId),
      tasks: [...snapshot.tasks, restored],
      deletedTaskCount: Math.max(0, snapshot.deletedTaskCount - 1),
    });

    db.restoreTask(taskId).catch(() => {
      set({
        deletedTasks: snapshot.deletedTasks,
        tasks: snapshot.tasks,
        deletedTaskCount: snapshot.deletedTaskCount,
      });
      toast.error('Failed to restore task');
    });
    if (task) {
      logAction('Task Restored', `Restored task "${task.title}"`, 'task');
      logTaskActivity(taskId, [{ field: 'restored' }]);
    }
  },

  permanentlyDeleteTask: (taskId) => {
    const snapshot = get();
    const task = snapshot.deletedTasks.find((t) => t.id === taskId);
    set({
      deletedTasks: snapshot.deletedTasks.filter((t) => t.id !== taskId),
      deletedTaskCount: Math.max(0, snapshot.deletedTaskCount - 1),
    });
    db.permanentlyDeleteTask(taskId).catch(() => {
      set({ deletedTasks: snapshot.deletedTasks, deletedTaskCount: snapshot.deletedTaskCount });
      toast.error('Failed to permanently delete task');
    });
    if (task) logAction('Task Permanently Deleted', `Permanently deleted "${task.title}"`, 'task');
  },

  emptyBin: () => {
    const prev = get().deletedTasks;
    const ids = prev.map((t) => t.id);
    set({ deletedTasks: [], deletedTaskCount: 0 });
    db.permanentlyDeleteTasks(ids).catch(() => {
      set({ deletedTasks: prev, deletedTaskCount: prev.length });
      toast.error('Failed to empty bin');
    });
    logAction('Bin Emptied', `Emptied bin (${prev.length} tasks)`, 'task');
  },

  loadDeletedTasks: async () => {
    try {
      const tasks = await db.fetchDeletedTasks();
      set({ deletedTasks: tasks, deletedTaskCount: tasks.length });
    } catch {
      toast.error('Failed to load deleted tasks');
    }
  },

  notifyMention: (recipientIds, actorName, taskTitle, taskId, teamId) => {
    const msg = `${actorName} mentioned you in a comment on "${taskTitle}"`;
    notifyMany(recipientIds, 'comment_mention', msg, { taskId, teamId });
  },

  // Load all data with resilient fetching
  loadAllData: async (authUserId) => {
    // Profile is critical - must succeed
    const profileResult = await db.findProfileByAuthId(authUserId);
    if (!profileResult) return null;

    // Use Promise.allSettled for remaining data - partial failure is OK
    const results = await Promise.allSettled([
      db.fetchTeams(), // 0
      db.fetchTasks(), // 1
      db.fetchMembers(), // 2
      db.fetchAbsences(), // 3
      db.fetchShifts(), // 4
      db.fetchLogs(), // 5
      db.fetchTeamStatusData(), // 6 - combined statuses + categories
      db.fetchTeamContentTypes(), // 7
      db.fetchPermissions(), // 8
      db.fetchCustomProperties(), // 9
      db.fetchPlacements(), // 10
      db.fetchIntegrations(), // 11
      db.fetchDeletedTaskCount(), // 12
      db.fetchTaskTeamLinks(), // 13
      db.fetchTeamPlacements(), // 14
      db.fetchUserTeamOrders(profileResult.id, 'sidebar'), // 15
      db.fetchUserTeamOrders(profileResult.id, 'schedule'), // 16
      db.fetchTeamHiddenColumns(), // 17
    ]);

    const getValue = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback;

    const teamStatusData = getValue(results[6], { statuses: {}, categories: {} });
    const sidebarOrders = getValue(results[15], {} as Record<string, number>);
    const scheduleOrders = getValue(results[16], {} as Record<string, number>);
    const hiddenColumnsRows = getValue(results[17], [] as { teamId: string; columnKey: string }[]);
    const hiddenColumnsMap: Record<string, string[]> = {};
    for (const row of hiddenColumnsRows) {
      if (!hiddenColumnsMap[row.teamId]) hiddenColumnsMap[row.teamId] = [];
      hiddenColumnsMap[row.teamId].push(row.columnKey);
    }

    // Sort teams by user's sidebar order, falling back to default sort_order
    const teams = getValue(results[0], []);
    const hasUserOrder = Object.keys(sidebarOrders).length > 0;
    if (hasUserOrder) {
      teams.sort((a, b) => (sidebarOrders[a.id] ?? 9999) - (sidebarOrders[b.id] ?? 9999));
    }

    set({
      teams,
      sidebarTeamOrders: sidebarOrders,
      scheduleTeamOrders: scheduleOrders,
      tasks: getValue(results[1], []),
      members: getValue(results[2], []),
      absences: getValue(results[3], []),
      shifts: getValue(results[4], []),
      logs: getValue(results[5], []),
      teamStatuses: teamStatusData.statuses,
      teamTypes: getValue(results[7], {}),
      permissions: getValue(results[8], {}),
      teamProperties: getValue(results[9], {}),
      allPlacements: getValue(results[10], []),
      integrations: getValue(results[11], {}),
      statusCategories: teamStatusData.categories,
      deletedTaskCount: getValue(results[12], 0),
      taskTeamLinks: getValue(results[13], []),
      teamPlacements: getValue(results[14], {} as Record<string, string[]>),
      teamHiddenColumns: hiddenColumnsMap,
    });

    // Auto-purge tasks deleted more than 30 days ago (fire-and-forget)
    db.purgeOldDeletedTasks().catch(console.error);

    // Log any failures for debugging
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Data fetch [${i}] failed:`, r.reason);
      }
    });

    return profileResult;
  },
}));
