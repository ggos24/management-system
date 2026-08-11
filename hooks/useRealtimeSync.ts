import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { captureAuthSession, isAuthSessionCurrent, useAuthStore } from '../stores/authStore';
import * as db from '../lib/database';
import { toast } from 'sonner';

function useDebouncedCallback(fn: () => void, delay: number): () => void {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(), delay);
  }, [delay]);
}

function fetchForCurrentSession<T>(
  fetcher: () => Promise<T>,
  commit: (value: T) => void,
  options?: { fullOnly?: boolean },
): void {
  const snapshot = captureAuthSession();
  if (!snapshot.authUserId || !snapshot.profileId || (options?.fullOnly && snapshot.accessScope !== 'full')) return;
  fetcher()
    .then((value) => {
      if (isAuthSessionCurrent(snapshot)) commit(value);
    })
    .catch(console.error);
}

function loadNotificationsForCurrentSession(): void {
  const snapshot = captureAuthSession();
  if (!snapshot.authUserId || !snapshot.profileId) return;
  void useUiStore.getState().loadNotifications(() => isAuthSessionCurrent(snapshot));
}

export function useRealtimeSync() {
  const storeRef = useRef(useDataStore);
  const reloadRetryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retryReloadRef = useRef<() => void>(() => undefined);
  const currentUserId = useAuthStore((s) => s.currentUser?.id);

  const debouncedFetchTasks = useDebouncedCallback(() => {
    const { setTasks, setDeletedTaskCount } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTasks, setTasks);
    fetchForCurrentSession(db.fetchDeletedTaskCount, setDeletedTaskCount, { fullOnly: true });
  }, 300);

  const debouncedFetchTickets = useDebouncedCallback(() => {
    const { setTickets } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTickets, setTickets, { fullOnly: true });
  }, 300);

  const debouncedFetchMembers = useDebouncedCallback(() => {
    const { setMembers } = storeRef.current.getState();
    const scope = useAuthStore.getState().currentUser?.accessScope;
    fetchForCurrentSession(scope === 'related_only' ? db.fetchVisibleMembers : db.fetchMembers, setMembers);
  }, 300);

  const debouncedFetchAbsences = useDebouncedCallback(() => {
    const { setAbsences } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchAbsences, setAbsences, { fullOnly: true });
  }, 300);

  const debouncedFetchShifts = useDebouncedCallback(() => {
    const { setShifts } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchShifts, setShifts, { fullOnly: true });
  }, 300);

  const debouncedFetchTaskTeamLinks = useDebouncedCallback(() => {
    const { setTaskTeamLinks } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTaskTeamLinks, setTaskTeamLinks);
  }, 300);

  const debouncedFetchTeamPlacements = useDebouncedCallback(() => {
    const { setTeamPlacements } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTeamPlacements, setTeamPlacements);
  }, 300);

  const debouncedFetchTeamHiddenColumns = useDebouncedCallback(() => {
    const { setTeamHiddenColumns } = storeRef.current.getState();
    fetchForCurrentSession(
      db.fetchTeamHiddenColumns,
      (rows) => {
        const map: Record<string, string[]> = {};
        for (const row of rows) {
          if (!map[row.teamId]) map[row.teamId] = [];
          map[row.teamId].push(row.columnKey);
        }
        setTeamHiddenColumns(map);
      },
      { fullOnly: true },
    );
  }, 300);

  const debouncedFetchTeamStatuses = useDebouncedCallback(() => {
    const { setTeamStatuses } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTeamStatuses, setTeamStatuses);
  }, 300);

  const debouncedFetchPersonFieldConfig = useDebouncedCallback(() => {
    const { setTeamPersonFieldConfig } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTeamPersonFieldConfig, (rows) => {
      const map: Record<
        string,
        Partial<Record<'author' | 'editor' | 'designer', { label: string | null; hidden: boolean }>>
      > = {};
      for (const row of rows) {
        if (!map[row.teamId]) map[row.teamId] = {};
        map[row.teamId][row.fieldKey] = { label: row.label, hidden: row.hidden };
      }
      setTeamPersonFieldConfig(map);
    });
  }, 300);

  const debouncedReloadSession = useDebouncedCallback(() => {
    const uiState = useUiStore.getState();
    const wasTaskOpen = uiState.isTaskModalOpen;
    const openTaskId = uiState.taskModalData.id;
    const openContextTeamId = uiState.taskModalData.viewingTeamId || uiState.taskModalData.teamId;
    const authUserId = useAuthStore.getState().session?.user.id;
    useAuthStore
      .getState()
      .reloadData()
      .then(() => {
        clearTimeout(reloadRetryTimerRef.current);
        toast.dismiss('task-access-retry');
        if (!authUserId || useAuthStore.getState().session?.user.id !== authUserId || !wasTaskOpen || !openTaskId)
          return;
        const dataState = useDataStore.getState();
        const currentUser = useAuthStore.getState().currentUser;
        const taskStillVisible = dataState.tasks.some((task) => task.id === openTaskId);
        const contextStillVisible =
          currentUser?.accessScope !== 'related_only' ||
          (!openContextTeamId
            ? dataState.taskAccessContexts.some((context) => context.taskId === openTaskId)
            : dataState.taskAccessContexts.some(
                (context) => context.taskId === openTaskId && context.contextTeamId === openContextTeamId,
              ));
        if (!taskStillVisible || !contextStillVisible) {
          useUiStore.setState({ isTaskModalOpen: false, taskModalData: {} });
          toast.info('Access to this task was removed');
        }
      })
      .catch((error) => {
        console.error(error);
        if (authUserId && useAuthStore.getState().session?.user.id === authUserId) {
          const currentUser = useAuthStore.getState().currentUser;
          if (currentUser?.accessScope === 'related_only') {
            // Access may have been revoked while disconnected. A failed ACL
            // reconciliation must not leave the old restricted bundle usable.
            useDataStore.getState().resetData();
            useUiStore.setState({ isTaskModalOpen: false, taskModalData: {} });
            toast.error('Unable to verify task access. Retrying…', { id: 'task-access-retry' });
            clearTimeout(reloadRetryTimerRef.current);
            reloadRetryTimerRef.current = setTimeout(() => retryReloadRef.current(), 2_000);
          }
        }
      });
  }, 300);

  useEffect(() => {
    retryReloadRef.current = debouncedReloadSession;
    return () => clearTimeout(reloadRetryTimerRef.current);
  }, [debouncedReloadSession]);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        debouncedFetchTasks();
        if (useAuthStore.getState().currentUser?.accessScope === 'related_only') debouncedFetchMembers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
        if (useAuthStore.getState().currentUser?.accessScope === 'related_only') debouncedFetchMembers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        debouncedFetchTickets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const currentUser = useAuthStore.getState().currentUser;
        const changedId = (payload.new as { id?: string } | null)?.id || (payload.old as { id?: string } | null)?.id;
        if (currentUser?.id && changedId === currentUser.id) {
          debouncedReloadSession();
        } else if (currentUser?.accessScope === 'full') {
          debouncedFetchMembers();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => {
        debouncedFetchMembers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => {
        debouncedFetchAbsences();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        debouncedFetchShifts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_team_links' }, () => {
        debouncedFetchTaskTeamLinks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_statuses' }, () => {
        debouncedFetchTeamStatuses();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_placements' }, () => {
        debouncedFetchTeamPlacements();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_hidden_columns' }, () => {
        debouncedFetchTeamHiddenColumns();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_person_field_config' }, () => {
        debouncedFetchPersonFieldConfig();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        loadNotificationsForCurrentSession();
      })
      .subscribe();

    const accessChannel = currentUserId
      ? supabase
          .channel(`task-access-${currentUserId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'task_access_revisions',
              filter: `profile_id=eq.${currentUserId}`,
            },
            () => debouncedReloadSession(),
          )
          .subscribe((status) => {
            // Postgres Changes does not replay revisions missed while offline.
            // Refetch once the private user channel (re)subscribes so cached
            // tasks are reconciled under current RLS before they are reused.
            if (status === 'SUBSCRIBED') debouncedReloadSession();
          })
      : null;

    // Private support attachment URLs expire after ten minutes. Refresh the
    // full-access ticket bundle in the background before that deadline.
    const privateAssetRefresh = window.setInterval(
      () => {
        if (useAuthStore.getState().currentUser?.accessScope === 'full') debouncedFetchTickets();
      },
      8 * 60 * 1000,
    );

    return () => {
      window.clearInterval(privateAssetRefresh);
      supabase.removeChannel(channel);
      if (accessChannel) supabase.removeChannel(accessChannel);
    };
    // Stable deps only — debounced callbacks use refs internally, so they never change.
    // loadNotifications is accessed via getState() to avoid dependency instability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);
}
