export type TeamType = 'editorial' | 'video' | 'social' | 'management' | string;
export type TaskStatus = string; // Was specific union, now string to support custom columns
export type Priority = 'low' | 'medium' | 'high';
export type UserRole = 'admin' | 'user';

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
  type: 'text' | 'date' | 'select' | 'multiselect' | 'person';
  options?: string[];
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
  placements: string[];
  links?: TaskLink[];
  contentInfo?: ContentInfo;
  customFieldValues?: Record<string, any>;
}

export interface Absence {
  id: string;
  memberId: string;
  type: 'holiday' | 'sick' | 'business_trip' | 'day_off'; // Removed vacation
  startDate: string;
  endDate: string;
  approved: boolean;
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
