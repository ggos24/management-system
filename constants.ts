
import { Member, Task, Absence, Team, Shift, LogEntry } from './types';

export const TEAMS: Team[] = [
  { id: 'editorial', name: 'Website Editorial Team', icon: 'FileText', scheduleType: 'shift-based' },
  { id: 'news', name: 'Website News Team', icon: 'Globe', scheduleType: 'shift-based', hidden: true },
  { id: 'video', name: 'YouTube Reports Team', icon: 'Video', scheduleType: 'shift-based' },
  { id: 'social', name: 'Social Media Team', icon: 'Instagram', scheduleType: 'absence-only' },
  { id: 'management', name: 'Management Team', icon: 'Briefcase', scheduleType: 'absence-only' },
];

export const TEAM_STATUSES: Record<string, string[]> = {
    editorial: [
        'Dropped', 'Archive', 'Stuck', 'Pitch', 'Approved', 
        'Working on Next Week', 'Working on This Week', 'Working on Today', 
        'Ready for Editing', 'Published This Week', 'Need to Update (SEO)'
    ],
    video: ['Pre-Production', 'Production', 'Post-Production', 'Published'],
    social: ['Ready to be Taken', 'In Writing', 'In Design', 'In Approvals', 'Done'],
    management: ['Urgent Important', 'Urgent Not Important', 'Important Not Urgent', 'Not Urgent Not Important'],
    default: ['To Do', 'In Progress', 'Done']
};

export const TEAM_CONTENT_TYPES: Record<string, string[]> = {
    editorial: ['Editorial', 'Opinion', 'Photoreport', 'Videoreport'],
    video: ['Videoreport', 'Interview', 'Podcast'],
    social: ['Slider Post', 'Image Post'],
    management: ['Recurring', 'One-Time'],
    default: ['General']
};

export const MOCK_MEMBERS: Member[] = [
  { id: '1', name: 'Alice Chen', role: 'admin', jobTitle: 'Editor in Chief', avatar: 'https://picsum.photos/100/100?random=1', teamId: 'editorial', status: 'active' },
  { id: '2', name: 'Bob Smith', role: 'user', jobTitle: 'Senior Producer', avatar: 'https://picsum.photos/100/100?random=2', teamId: 'video', status: 'active' },
  { id: '3', name: 'Charlie Kim', role: 'user', jobTitle: 'Social Lead', avatar: 'https://picsum.photos/100/100?random=3', teamId: 'social', status: 'vacation' },
  { id: '4', name: 'Diana Prince', role: 'user', jobTitle: 'Journalist', avatar: 'https://picsum.photos/100/100?random=4', teamId: 'editorial', status: 'sick' },
  { id: '5', name: 'Evan Wright', role: 'user', jobTitle: 'Video Editor', avatar: 'https://picsum.photos/100/100?random=5', teamId: 'video', status: 'active' },
  { id: '6', name: 'Sarah Connor', role: 'admin', jobTitle: 'Operations Manager', avatar: 'https://picsum.photos/100/100?random=6', teamId: 'management', status: 'active' },
  { id: '7', name: 'Mike Ross', role: 'user', jobTitle: 'News Writer', avatar: 'https://picsum.photos/100/100?random=7', teamId: 'news', status: 'active' },
];

export const MOCK_TASKS: Task[] = [
  { 
    id: '101', 
    title: 'Deep Dive: AI in 2025', 
    description: 'Long read about the future of generative AI.', 
    type: 'editorial', 
    status: 'Ready for Editing', 
    priority: 'high', 
    assigneeIds: ['4'], 
    dueDate: '2025-06-15', 
    placements: ['Main Page', 'Newsletter'], 
    links: [{ title: 'Reference 1', url: 'https://google.com' }],
    contentInfo: { type: 'Editorial', editorIds: ['1'], notes: 'Needs expert quotes', files: [{name: 'draft_v1.docx', url: '#'}] }
  },
  { 
    id: '102', 
    title: 'Review: iPhone 17', 
    description: 'Comprehensive review video.', 
    type: 'video', 
    status: 'Pre-Production', 
    priority: 'high', 
    assigneeIds: ['2', '5'], 
    dueDate: '2025-06-10', 
    placements: ['YouTube', 'Shorts'],
    contentInfo: { type: 'Videoreport' }
  },
  { 
    id: '103', 
    title: 'Weekly News Recap', 
    description: 'Instagram reel summarising the week.', 
    type: 'social', 
    status: 'In Writing', 
    priority: 'medium', 
    assigneeIds: ['3'], 
    dueDate: '2025-06-07', 
    placements: ['Instagram', 'TikTok'] 
  },
  { 
    id: '104', 
    title: 'Interview with Sam Altman', 
    description: 'Transcript and article.', 
    type: 'editorial', 
    status: 'Published This Week', 
    priority: 'high', 
    assigneeIds: ['1'], 
    dueDate: '2025-05-20', 
    placements: ['Main Page'],
    contentInfo: { type: 'Interview', editorIds: ['1'] }
  },
  { id: '105', title: 'Office Tour', description: 'YouTube Shorts office tour.', type: 'social', status: 'Done', priority: 'low', assigneeIds: ['3'], dueDate: '2025-05-15', placements: ['Stories'] },
  { id: '106', title: 'Documentary: Urban Farming', description: '20 min mini-doc.', type: 'video', status: 'Production', priority: 'medium', assigneeIds: ['5'], dueDate: '2025-07-01', placements: ['YouTube'] },
  { id: '107', title: 'Q3 Strategy Meeting', description: 'Planning for next quarter.', type: 'management', status: 'Urgent Important', priority: 'high', assigneeIds: ['6'], dueDate: '2025-06-01', placements: ['Internal'] },
  { id: '108', title: 'Breaking: Market Crash', description: 'Urgent news update.', type: 'news', status: 'Published', priority: 'high', assigneeIds: ['7'], dueDate: '2025-06-02', placements: ['Ticker', 'Push'] },
];

export const MOCK_ABSENCES: Absence[] = [
  { id: 'a1', memberId: '3', type: 'holiday', startDate: '2025-06-01', endDate: '2025-06-14', approved: true },
  { id: 'a2', memberId: '4', type: 'sick', startDate: '2025-06-05', endDate: '2025-06-08', approved: true },
];

export const MOCK_SHIFTS: Shift[] = [
    { id: 's1', memberId: '1', date: '2025-06-02', startTime: '09:00', endTime: '17:00' },
    { id: 's2', memberId: '1', date: '2025-06-03', startTime: '09:00', endTime: '17:00' },
    { id: 's3', memberId: '2', date: '2025-06-02', startTime: '10:00', endTime: '18:00' },
    { id: 's4', memberId: '7', date: '2025-06-02', startTime: '08:00', endTime: '16:00' },
];

export const MOCK_LOGS: LogEntry[] = [
    { id: 'l1', action: 'Task Created', details: 'Created task "Deep Dive: AI in 2025"', userId: '1', timestamp: '2025-06-01T10:00:00Z' },
    { id: 'l2', action: 'Status Updated', details: 'Moved "Review: iPhone 17" to Pre-Production', userId: '2', timestamp: '2025-06-02T14:30:00Z' },
    { id: 'l3', action: 'Absence Added', details: 'Added Holiday for Charlie Kim', userId: '1', timestamp: '2025-06-03T09:15:00Z' },
    { id: 'l4', action: 'Team Setting', details: 'Added new status "Pitch" to Editorial', userId: '6', timestamp: '2025-06-04T11:20:00Z' },
    { id: 'l5', action: 'Task Updated', details: 'Updated priority for "Market Crash"', userId: '7', timestamp: '2025-06-05T08:00:00Z' },
    { id: 'l6', action: 'File Attached', details: 'Attached "draft_v1.docx" to Task 101', userId: '1', timestamp: '2025-06-05T10:00:00Z' },
    { id: 'l7', action: 'Shift Created', details: 'Assigned shift to Mike Ross', userId: '6', timestamp: '2025-06-06T15:45:00Z' },
    { id: 'l8', action: 'Integration', details: 'Connected Slack workspace', userId: '1', timestamp: '2025-06-07T12:00:00Z' },
];

export const STATUS_COLORS: Record<string, string> = {
  // Generic / Video
  'Pre-Production': 'bg-orange-50 border-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300',
  'Production': 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300',
  'Post-Production': 'bg-purple-50 border-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300',
  'To Do': 'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
  'In Progress': 'bg-blue-100 text-blue-700 border border-transparent dark:bg-blue-900/40 dark:text-blue-200',
  'Done': 'bg-emerald-100 text-emerald-700 border border-transparent dark:bg-emerald-900/40 dark:text-emerald-200',
  
  // Social Media
  'Ready to be Taken': 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/20 dark:text-sky-300',
  'In Writing': 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300',
  'In Design': 'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-900/20 dark:text-pink-300',
  'In Approvals': 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300',
  
  // Management (Eisenhower)
  'Urgent Important': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200',
  'Urgent Not Important': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200',
  'Important Not Urgent': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200',
  'Not Urgent Not Important': 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',

  // Editorial Specific
  'Dropped': 'bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-500',
  'Archive': 'bg-zinc-100 text-zinc-500 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-700',
  'Stuck': 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/30',
  'Pitch': 'bg-pink-50 border border-pink-100 text-pink-600 dark:bg-pink-900/20 dark:border-pink-900/30 dark:text-pink-300',
  'Approved': 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-900/30',
  'Working on Next Week': 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-900/30',
  'Working on This Week': 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/30',
  'Working on Today': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800',
  'Ready for Editing': 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-900/30',
  'Published This Week': 'bg-black text-white border border-black dark:bg-white dark:text-black',
  'Need to Update (SEO)': 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-900/30',
  
  // Legacy mappings for safety
  'Published': 'bg-black text-white border border-black dark:bg-white dark:text-black',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-zinc-400',
  medium: 'text-zinc-600 dark:text-zinc-400',
  high: 'text-black dark:text-white font-medium',
};
