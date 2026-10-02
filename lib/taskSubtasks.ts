import type { TaskSubtask } from '../types';

export function subtaskProgress(items: TaskSubtask[]) {
  return { done: items.filter((item) => item.completed).length, total: items.length };
}
