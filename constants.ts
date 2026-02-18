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

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-zinc-400',
  medium: 'text-zinc-600 dark:text-zinc-400',
  high: 'text-black dark:text-white font-medium',
};
