import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';

export function useTaskDeepLink() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setTaskModalData = useUiStore((s) => s.setTaskModalData);
  const setIsTaskModalOpen = useUiStore((s) => s.setIsTaskModalOpen);

  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId) return;

    // Wait a tick so the view renders, then open the task modal
    const timer = setTimeout(() => {
      const task = useDataStore.getState().tasks.find((t) => t.id === taskId);
      if (task) {
        setTaskModalData(task);
        setIsTaskModalOpen(true);
      }
      // Clean up the URL to remove ?task=
      setSearchParams(
        (prev) => {
          prev.delete('task');
          return prev;
        },
        { replace: true },
      );
    }, 100);

    return () => clearTimeout(timer);
  }, [searchParams, setSearchParams, setTaskModalData, setIsTaskModalOpen]);
}
