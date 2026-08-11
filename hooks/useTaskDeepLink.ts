import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import * as db from '../lib/database';
import { toast } from 'sonner';

export function useTaskDeepLink() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setTaskModalData = useUiStore((s) => s.setTaskModalData);
  const setIsTaskModalOpen = useUiStore((s) => s.setIsTaskModalOpen);
  const accessScope = useAuthStore((s) => s.currentUser?.accessScope);

  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId) return;
    let cancelled = false;
    const openTask = async () => {
      const state = useDataStore.getState();
      // Related-only links are always re-read through RLS. Never trust a task
      // object that may have survived briefly in an older client bundle.
      let task =
        accessScope === 'related_only' ? null : state.tasks.find((candidate) => candidate.id === taskId) || null;
      if (accessScope === 'related_only' || !task) {
        try {
          task = await db.fetchTaskById(taskId);
        } catch (error) {
          console.error(error);
        }
      }
      if (cancelled) return;
      if (!task) {
        toast.error('Task unavailable');
        setSearchParams(
          (previous) => {
            previous.delete('task');
            previous.delete('context');
            return previous;
          },
          { replace: true },
        );
        return;
      }
      const currentTasks = useDataStore.getState().tasks;
      if (currentTasks.some((candidate) => candidate.id === taskId)) {
        state.setTasks(currentTasks.map((candidate) => (candidate.id === taskId ? task! : candidate)));
      } else {
        state.setTasks([...currentTasks, task]);
      }
      const requestedContext = searchParams.get('context');
      let accessContexts = useDataStore.getState().taskAccessContexts;
      if (accessScope === 'related_only') {
        try {
          accessContexts = await db.fetchTaskAccessContexts();
          if (cancelled) return;
          useDataStore.getState().setTaskAccessContexts(accessContexts);
        } catch (error) {
          console.error(error);
          accessContexts = [];
        }
      }
      const allowedContexts = accessContexts
        .filter((context) => context.taskId === taskId)
        .map((context) => context.contextTeamId);
      if (
        accessScope === 'related_only' &&
        (allowedContexts.length === 0 || (requestedContext !== null && !allowedContexts.includes(requestedContext)))
      ) {
        toast.error('Task unavailable');
        setSearchParams(
          (previous) => {
            previous.delete('task');
            previous.delete('context');
            return previous;
          },
          { replace: true },
        );
        return;
      }
      const viewingTeamId =
        accessScope === 'related_only' ? requestedContext || allowedContexts[0] : requestedContext || task.teamId;
      setTaskModalData({ ...task, viewingTeamId });
      setIsTaskModalOpen(true);
    };
    void openTask();
    return () => {
      cancelled = true;
    };
  }, [accessScope, searchParams, setSearchParams, setTaskModalData, setIsTaskModalOpen]);
}
