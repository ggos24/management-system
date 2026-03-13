export type TeamType = 'editorial' | 'video' | 'social' | 'management' | string;
export type TaskStatus = string; // Was specific union, now string to support custom columns
export type Priority = 'low' | 'medium' | 'high';
export type UserRole = 'super_admin' | 'admin' | 'user';
export type AbsenceStatus = 'pending' | 'approved' | 'declined';

export interface User {
  id: string;
  name: string;
  role: UserRole; // App access level
  jobTitle: string; // Job title e.g. "Senior Editor"
  avatar: string;
  teamId: string;
}

export interface Team {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  scheduleType: 'absence-only' | 'shift-based';
  hidden?: boolean; // New property to hide from sidebar
  archived?: boolean; // New property for archived teams
  adminOnly?: boolean;
  sortOrder?: number;
}

export interface TaskLink {
  title: string;
  url: string;
}

export interface TaskFile {
  name: string;
  url: string;
}

export interface ContentInfo {
  type: string; // Editorial, Opinion, etc.
  editorIds?: string[]; // Changed to array
  designerIds?: string[]; // Added for Social Media team
  notes?: string;
  files?: TaskFile[];
}

export interface CustomProperty {
  id: string;
  name: string;
  type: 'text' | 'date' | 'select' | 'multiselect' | 'person' | 'tags';
  options?: string[];
  optionColors?: Record<string, string>;
  sortOrder?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  teamId: string; // was 'type' — correlates to Team ID
  status: TaskStatus;
  assigneeIds: string[];
  priority: Priority;
  dueDate: string;
  doneDate?: string | null;
  placements: string[];
  links?: TaskLink[];
  contentInfo?: ContentInfo;
  customFieldValues?: Record<string, any>;
  sortOrder?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface Absence {
  id: string;
  memberId: string;
  type: 'holiday' | 'sick' | 'business_trip' | 'day_off';
  startDate: string;
  endDate: string;
  status: AbsenceStatus;
  decidedBy?: string | null;
  decidedAt?: string | null;
  declineReason?: string | null;
}

export interface Shift {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface Member extends User {
  status: 'active' | 'sick' | 'vacation' | 'remote';
}

export interface DashboardMetric {
  name: string;
  value: number;
  change: number; // percentage
  trend: 'up' | 'down' | 'neutral';
}

export interface LogEntry {
  id: string;
  action: string; // e.g., "Updated Task", "Created Team"
  details: string;
  userId: string;
  timestamp: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  // Joined from profiles
  userName?: string;
  userAvatar?: string;
}

export type DocSection = 'help' | 'knowledge-base';

export interface Doc {
  id: string;
  parentId: string | null;
  section: DocSection;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  contentHtml: string;
  description: string | null;
  icon: string | null;
  isFolder: boolean;
  sortOrder: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_updated'
  | 'task_unassigned'
  | 'task_deleted'
  | 'absence_submitted'
  | 'absence_decided'
  | 'member_invited'
  | 'comment_mention'
  | 'absence_cancelled';

export interface Notification {
  id: string;
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  message: string;
  entityData: Record<string, any>;
  read: boolean;
  createdAt: string;
}
