export const STATUS_COLORS: Record<string, string> = {
  // Generic / Video
  'Pre-Production': 'bg-orange-50 border-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300',
  Production: 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300',
  'Post-Production': 'bg-purple-50 border-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300',
  'To Do': 'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
  'In Progress': 'bg-blue-100 text-blue-700 border border-transparent dark:bg-blue-900/40 dark:text-blue-200',
  Done: 'bg-emerald-100 text-emerald-700 border border-transparent dark:bg-emerald-900/40 dark:text-emerald-200',

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
  Dropped: 'bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-500',
  Archive: 'bg-zinc-100 text-zinc-500 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-700',
  Stuck: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/30',
  Pitch:
    'bg-pink-50 border border-pink-100 text-pink-600 dark:bg-pink-900/20 dark:border-pink-900/30 dark:text-pink-300',
  Approved: 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-900/30',
  'Working on Next Week':
    'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-900/30',
  'Working on This Week':
    'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/30',
  'Working on Today':
    'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800',
  'Ready for Editing':
    'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-900/30',
  'Published This Week': 'bg-black text-white border border-black dark:bg-white dark:text-black',
  'Need to Update (SEO)':
    'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-900/30',

  // Legacy mappings for safety
  Published: 'bg-black text-white border border-black dark:bg-white dark:text-black',
};

// Fallback palette for statuses not in STATUS_COLORS (custom/dynamic statuses)
const FALLBACK_PALETTE = [
  'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-300',
  'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-300',
  'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
  'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/20 dark:border-teal-800 dark:text-teal-300',
  'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300',
  'bg-lime-50 border-lime-200 text-lime-700 dark:bg-lime-900/20 dark:border-lime-800 dark:text-lime-300',
  'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800 dark:text-cyan-300',
  'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:border-fuchsia-800 dark:text-fuchsia-300',
];

/** Deterministic hash to pick a palette color for any string */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Returns a consistent color class string for any status — known or custom */
export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || FALLBACK_PALETTE[hashString(status) % FALLBACK_PALETTE.length];
}

// Left-border accent colors for calendar pills (neutral bg, colored left stripe)
const STATUS_ACCENTS: Record<string, string> = {
  'To Do': 'border-l-zinc-400',
  'In Progress': 'border-l-blue-500',
  Done: 'border-l-emerald-500',
  'Pre-Production': 'border-l-orange-400',
  Production: 'border-l-blue-400',
  'Post-Production': 'border-l-purple-500',
  'Ready to be Taken': 'border-l-sky-500',
  'In Writing': 'border-l-indigo-500',
  'In Design': 'border-l-pink-500',
  'In Approvals': 'border-l-amber-500',
  'Urgent Important': 'border-l-red-500',
  'Urgent Not Important': 'border-l-orange-500',
  'Important Not Urgent': 'border-l-blue-500',
  'Not Urgent Not Important': 'border-l-zinc-400',
  Dropped: 'border-l-zinc-400',
  Archive: 'border-l-zinc-400',
  Stuck: 'border-l-red-400',
  Pitch: 'border-l-pink-400',
  Approved: 'border-l-teal-500',
  'Working on Next Week': 'border-l-indigo-400',
  'Working on This Week': 'border-l-blue-400',
  'Working on Today': 'border-l-orange-500',
  'Ready for Editing': 'border-l-purple-400',
  'Published This Week': 'border-l-black dark:border-l-white',
  Published: 'border-l-black dark:border-l-white',
  'Need to Update (SEO)': 'border-l-yellow-500',
};

const ACCENT_FALLBACK = [
  'border-l-sky-500',
  'border-l-violet-500',
  'border-l-amber-500',
  'border-l-teal-500',
  'border-l-rose-500',
  'border-l-lime-500',
  'border-l-cyan-500',
  'border-l-fuchsia-500',
];

/** Returns a left-border accent class for calendar/compact pill views */
export function getStatusAccent(status: string): string {
  return STATUS_ACCENTS[status] || ACCENT_FALLBACK[hashString(status) % ACCENT_FALLBACK.length];
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-zinc-500 dark:text-zinc-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  high: 'text-red-600 dark:text-red-400 font-medium',
};

export const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-zinc-400',
  medium: 'bg-yellow-500',
  high: 'bg-red-500',
};
