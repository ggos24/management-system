import { supabase } from './supabase';
import { Task, Team, Member, Absence, Shift, LogEntry, CustomProperty } from '../types';

// === Mappers ===

function mapProfile(row: any): Member {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    jobTitle: row.job_title || '',
    avatar: row.avatar || '',
    teamId: row.team_id || '',
    status: row.status || 'active',
  };
}

function mapTeam(row: any): Team {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || 'Hash',
    scheduleType: row.schedule_type || 'shift-based',
    hidden: row.hidden || false,
    archived: row.archived || false,
    sortOrder: row.sort_order || 0,
  };
}

function mapTask(row: any, assigneeIds: string[], placements: string[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    teamId: row.team_id,
    status: row.status,
    priority: row.priority || 'medium',
    dueDate: row.due_date || '',
    assigneeIds,
    placements,
    links: row.links || [],
    contentInfo: {
      type: row.content_type || '',
      editorIds: row.editor_ids || [],
      designerIds: row.designer_ids || [],
      notes: row.notes || '',
      files: row.files || [],
    },
    customFieldValues: row.custom_field_values || {},
  };
}

function mapAbsence(row: any): Absence {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    approved: row.approved,
  };
}

function mapShift(row: any): Shift {
  return {
    id: row.id,
    memberId: row.member_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function mapLog(row: any): LogEntry {
  return {
    id: row.id,
    action: row.action,
    details: row.details || '',
    userId: row.user_id || '',
    timestamp: row.timestamp,
  };
}

// === Fetch Functions ===

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return (data || []).map(mapProfile);
}

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from('teams').select('*').order('sort_order');
  if (error) throw error;
  return (data || []).map(mapTeam);
}

export async function fetchTasks(): Promise<Task[]> {
  // Fetch tasks
  const { data: taskRows, error: taskError } = await supabase.from('tasks').select('*');
  if (taskError) throw taskError;

  // Fetch all task_assignees
  const { data: assigneeRows, error: assigneeError } = await supabase
    .from('task_assignees')
    .select('task_id, member_id, sort_order')
    .order('sort_order');
  if (assigneeError) throw assigneeError;

  // Fetch all task_placements with placement names
  const { data: placementRows, error: placementError } = await supabase
    .from('task_placements')
    .select('task_id, placements(name)');
  if (placementError) throw placementError;

  // Group assignees and placements by task_id
  const assigneesByTask: Record<string, string[]> = {};
  for (const row of assigneeRows || []) {
    if (!assigneesByTask[row.task_id]) assigneesByTask[row.task_id] = [];
    assigneesByTask[row.task_id].push(row.member_id);
  }

  const placementsByTask: Record<string, string[]> = {};
  for (const row of placementRows || []) {
    if (!placementsByTask[row.task_id]) placementsByTask[row.task_id] = [];
    const placementName = (row as any).placements?.name;
    if (placementName) placementsByTask[row.task_id].push(placementName);
  }

  return (taskRows || []).map((row) => mapTask(row, assigneesByTask[row.id] || [], placementsByTask[row.id] || []));
}

export async function fetchAbsences(): Promise<Absence[]> {
  const { data, error } = await supabase.from('absences').select('*');
  if (error) throw error;
  return (data || []).map(mapAbsence);
}

export async function fetchShifts(): Promise<Shift[]> {
  const { data, error } = await supabase.from('shifts').select('*');
  if (error) throw error;
  return (data || []).map(mapShift);
}

export async function fetchLogs(): Promise<LogEntry[]> {
  const { data, error } = await supabase.from('activity_log').select('*').order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLog);
}

export async function fetchTeamStatuses(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('team_statuses').select('team_id, name, sort_order').order('sort_order');
  if (error) throw error;

  const result: Record<string, string[]> = {};
  for (const row of data || []) {
    const key = row.team_id;
    if (!result[key]) result[key] = [];
    result[key].push(row.name);
  }
  return result;
}

export async function fetchTeamContentTypes(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('team_content_types').select('team_id, name');
  if (error) throw error;

  const result: Record<string, string[]> = {};
  for (const row of data || []) {
    const key = row.team_id;
    if (!result[key]) result[key] = [];
    result[key].push(row.name);
  }
  return result;
}

export async function fetchPermissions(): Promise<
  Record<string, { canCreate: boolean; canEdit: boolean; canDelete: boolean }>
> {
  const { data, error } = await supabase.from('permissions').select('*');
  if (error) throw error;

  const result: Record<string, { canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
  for (const row of data || []) {
    result[row.member_id] = {
      canCreate: row.can_create,
      canEdit: row.can_edit,
      canDelete: row.can_delete,
    };
  }
  return result;
}

export async function fetchCustomProperties(): Promise<Record<string, CustomProperty[]>> {
  const { data, error } = await supabase.from('custom_properties').select('*');
  if (error) throw error;

  const result: Record<string, CustomProperty[]> = {};
  for (const row of data || []) {
    const key = row.team_id;
    if (!result[key]) result[key] = [];
    result[key].push({
      id: row.id,
      name: row.name,
      type: row.type,
      options: row.options || [],
    });
  }
  return result;
}

export async function fetchPlacements(): Promise<string[]> {
  const { data, error } = await supabase.from('placements').select('name').order('sort_order');
  if (error) throw error;
  return (data || []).map((r) => r.name);
}

// === Auth helpers ===

export async function findProfileByAuthId(authUserId: string): Promise<Member | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('auth_user_id', authUserId).single();
  if (error || !data) return null;
  return mapProfile(data);
}

// === Mutation Functions ===

export async function upsertTask(task: Task) {
  const row = {
    id: task.id || undefined,
    title: task.title,
    description: task.description,
    team_id: task.teamId,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate ? task.dueDate.split('T')[0] : null,
    content_type: task.contentInfo?.type || null,
    notes: task.contentInfo?.notes || null,
    editor_ids: task.contentInfo?.editorIds || [],
    designer_ids: task.contentInfo?.designerIds || [],
    links: task.links || [],
    files: task.contentInfo?.files || [],
    custom_field_values: task.customFieldValues || {},
  };

  const { data, error } = await supabase.from('tasks').upsert(row, { onConflict: 'id' }).select().single();

  return { data, error };
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  return { error };
}

export async function updateTaskStatus(taskId: string, newStatus: string) {
  const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
  return { error };
}

export async function updateTaskDueDate(taskId: string, dueDate: string) {
  const { error } = await supabase
    .from('tasks')
    .update({ due_date: dueDate.split('T')[0] })
    .eq('id', taskId);
  return { error };
}

export async function syncTaskAssignees(taskId: string, memberIds: string[]) {
  // Delete existing
  await supabase.from('task_assignees').delete().eq('task_id', taskId);

  // Insert new
  if (memberIds.length > 0) {
    const rows = memberIds.map((memberId, index) => ({
      task_id: taskId,
      member_id: memberId,
      sort_order: index,
    }));
    const { error } = await supabase.from('task_assignees').insert(rows);
    return { error };
  }
  return { error: null };
}

export async function syncTaskPlacements(taskId: string, placementNames: string[]) {
  // Delete existing
  await supabase.from('task_placements').delete().eq('task_id', taskId);

  if (placementNames.length === 0) return { error: null };

  // Get or create placements
  const { data: existing } = await supabase.from('placements').select('id, name').in('name', placementNames);

  const existingMap = new Map((existing || []).map((p) => [p.name, p.id]));
  const missing = placementNames.filter((n) => !existingMap.has(n));

  if (missing.length > 0) {
    const { data: created } = await supabase
      .from('placements')
      .insert(missing.map((name) => ({ name })))
      .select('id, name');
    for (const p of created || []) {
      existingMap.set(p.name, p.id);
    }
  }

  // Insert junction rows
  const rows = placementNames
    .map((name) => ({ task_id: taskId, placement_id: existingMap.get(name)! }))
    .filter((r) => r.placement_id);

  if (rows.length > 0) {
    const { error } = await supabase.from('task_placements').insert(rows);
    return { error };
  }
  return { error: null };
}

// === Absence mutations ===

export async function upsertAbsence(absence: Absence) {
  const row = {
    id: absence.id || undefined,
    member_id: absence.memberId,
    type: absence.type,
    start_date: absence.startDate,
    end_date: absence.endDate,
    approved: absence.approved,
  };
  const { data, error } = await supabase.from('absences').upsert(row, { onConflict: 'id' }).select().single();
  return { data, error };
}

export async function deleteAbsence(id: string) {
  const { error } = await supabase.from('absences').delete().eq('id', id);
  return { error };
}

// === Shift mutations ===

export async function upsertShift(shift: Shift) {
  const row = {
    id: shift.id || undefined,
    member_id: shift.memberId,
    date: shift.date,
    start_time: shift.startTime,
    end_time: shift.endTime,
  };
  const { data, error } = await supabase.from('shifts').upsert(row, { onConflict: 'id' }).select().single();
  return { data, error };
}

export async function deleteShift(id: string) {
  const { error } = await supabase.from('shifts').delete().eq('id', id);
  return { error };
}

// === Team mutations ===

export async function upsertTeam(team: Team) {
  const row = {
    id: team.id || undefined,
    name: team.name,
    icon: team.icon,
    schedule_type: team.scheduleType,
    hidden: team.hidden || false,
    archived: team.archived || false,
    sort_order: team.sortOrder || 0,
  };
  const { data, error } = await supabase.from('teams').upsert(row, { onConflict: 'id' }).select().single();
  return { data, error };
}

export async function deleteTeam(id: string) {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  return { error };
}

export async function updateTeamSortOrders(teams: Team[]) {
  const updates = teams.map((t, i) => supabase.from('teams').update({ sort_order: i }).eq('id', t.id));
  await Promise.all(updates);
}

// === Member mutations ===

export async function upsertMember(member: Member) {
  const row = {
    id: member.id || undefined,
    name: member.name,
    role: member.role,
    job_title: member.jobTitle,
    avatar: member.avatar,
    team_id: member.teamId,
    status: member.status,
  };
  const { data, error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' }).select().single();
  return { data, error };
}

export async function deleteMember(id: string) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  return { error };
}

// === Permission mutations ===

export async function upsertPermission(
  memberId: string,
  perms: { canCreate: boolean; canEdit: boolean; canDelete: boolean },
) {
  const row = {
    member_id: memberId,
    can_create: perms.canCreate,
    can_edit: perms.canEdit,
    can_delete: perms.canDelete,
  };
  const { error } = await supabase.from('permissions').upsert(row, { onConflict: 'member_id' });
  return { error };
}

// === Log mutations ===

export async function insertLog(log: Omit<LogEntry, 'id'>) {
  const row = {
    user_id: log.userId,
    action: log.action,
    details: log.details,
    timestamp: log.timestamp || new Date().toISOString(),
  };
  const { data, error } = await supabase.from('activity_log').insert(row).select().single();
  return { data, error };
}

// === Team status mutations ===

export async function syncTeamStatuses(teamId: string, statuses: string[]) {
  // Delete existing statuses for this team
  await supabase.from('team_statuses').delete().eq('team_id', teamId);

  // Insert new statuses with sort order
  if (statuses.length > 0) {
    const rows = statuses.map((name, index) => ({
      team_id: teamId,
      name,
      sort_order: index,
    }));
    const { error } = await supabase.from('team_statuses').insert(rows);
    return { error };
  }
  return { error: null };
}

// === Team content type mutations ===

export async function syncTeamContentTypes(teamId: string, types: string[]) {
  await supabase.from('team_content_types').delete().eq('team_id', teamId);

  if (types.length > 0) {
    const rows = types.map((name) => ({ team_id: teamId, name }));
    const { error } = await supabase.from('team_content_types').insert(rows);
    return { error };
  }
  return { error: null };
}

// === Custom property mutations ===

export async function upsertCustomProperty(teamId: string, prop: CustomProperty) {
  const row = {
    id: prop.id || undefined,
    team_id: teamId,
    name: prop.name,
    type: prop.type,
    options: prop.options || [],
  };
  const { data, error } = await supabase.from('custom_properties').upsert(row, { onConflict: 'id' }).select().single();
  return { data, error };
}

export async function deleteCustomProperty(id: string) {
  const { error } = await supabase.from('custom_properties').delete().eq('id', id);
  return { error };
}

// === Integration mutations ===

export async function updateIntegrations(integrations: Record<string, boolean>) {
  const { error } = await supabase.from('app_settings').update({ integrations }).eq('id', 1);
  return { error };
}

export async function fetchIntegrations(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.from('app_settings').select('integrations').eq('id', 1).single();
  if (error || !data) return {};
  return data.integrations || {};
}
