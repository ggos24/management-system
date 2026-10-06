import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { captureAuthSession, DataReloadError, isAuthSessionCurrent, useAuthStore } from '../stores/authStore';
import * as db from '../lib/database';
import { toast } from 'sonner';
import { isAdmin } from '../constants';

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

// Backoff for retrying a session reload that did not complete: 2s, 4s, 8s, 16s, then every 30s.
const RELOAD_RETRY_BASE_MS = 2_000;
const RELOAD_RETRY_MAX_MS = 30_000;

function loadNotificationsForCurrentSession(): void {
  const snapshot = captureAuthSession();
  if (!snapshot.authUserId || !snapshot.profileId) return;
  void useUiStore.getState().loadNotifications(() => isAuthSessionCurrent(snapshot));
}

export function useRealtimeSync() {
  const storeRef = useRef(useDataStore);
  const reloadRetryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reloadRetryAttemptRef = useRef(0);
  const retryReloadRef = useRef<() => void>(() => undefined);
  const currentUserId = useAuthStore((s) => s.currentUser?.id);

  const debouncedFetchTasks = useDebouncedCallback(() => {
    const { setTasks, setDeletedTaskCount } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTasks, setTasks);
    fetchForCurrentSession(db.fetchDeletedTaskCount, setDeletedTaskCount, { fullOnly: true });
  }, 300);

  const debouncedFetchTaskSubtasks = useDebouncedCallback(() => {
    const { setTaskSubtasks } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTaskSubtasks, setTaskSubtasks);
  }, 300);

  const debouncedFetchTickets = useDebouncedCallback(() => {
    const { setTickets } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchTickets, setTickets, { fullOnly: true });
  }, 300);

  const debouncedFetchEquipment = useDebouncedCallback(() => {
    const { setEquipmentItems, setEquipmentCheckouts } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchEquipmentItems, setEquipmentItems, { fullOnly: true });
    fetchForCurrentSession(db.fetchEquipmentCheckouts, setEquipmentCheckouts, { fullOnly: true });
  }, 300);

  const debouncedFetchRenewals = useDebouncedCallback(() => {
    // Admin-only tables: anyone else would only get an empty result back.
    const role = useAuthStore.getState().currentUser?.role;
    if (!role || !isAdmin(role)) return;
    const { setAccreditations, setSubscriptions } = storeRef.current.getState();
    fetchForCurrentSession(db.fetchAccreditations, setAccreditations, { fullOnly: true });
    fetchForCurrentSession(db.fetchSubscriptions, setSubscriptions, { fullOnly: true });
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
    // Close the task modal if the reloaded data no longer grants the open task.
    const closeTaskIfAccessLost = () => {
      if (!authUserId || useAuthStore.getState().session?.user.id !== authUserId || !wasTaskOpen || !openTaskId) return;
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
    };
    useAuthStore
      .getState()
      .reloadData()
      .then((committed) => {
        // Superseded by a newer reload (or a sign-out): that one owns the retry
        // schedule and the outcome, so leave both alone.
        if (!committed) return;
        clearTimeout(reloadRetryTimerRef.current);
        reloadRetryAttemptRef.current = 0;
        toast.dismiss('task-access-retry');
        closeTaskIfAccessLost();
      })
      .catch((error) => {
        console.error(error);
        if (!authUserId || useAuthStore.getState().session?.user.id !== authUserId) return;
        const currentUser = useAuthStore.getState().currentUser;
        // A partial reload already confirmed the profile and committed the
        // bundle under current RLS; any other failure left task access unverified.
        const partial = error instanceof DataReloadError && error.reason === 'partial';
        if (partial) {
          // The committed data is current, so the open task is checked against
          // it exactly as after a complete reload.
          closeTaskIfAccessLost();
        } else if (currentUser?.accessScope === 'related_only') {
          // Access may have been revoked while disconnected. A failed ACL
          // reconciliation must not leave the old restricted bundle usable.
          useDataStore.getState().resetData();
          useUiStore.setState({ isTaskModalOpen: false, taskModalData: {} });
          toast.error('Unable to verify task access. Retrying…', { id: 'task-access-retry' });
        }
        // Full-access data that failed to reload kept its previous value, but it
        // may be missing changes made while this tab was disconnected (realtime
        // does not replay them), so keep retrying until a reload completes.
        const delay = Math.min(RELOAD_RETRY_BASE_MS * 2 ** reloadRetryAttemptRef.current, RELOAD_RETRY_MAX_MS);
        reloadRetryAttemptRef.current += 1;
        clearTimeout(reloadRetryTimerRef.current);
        reloadRetryTimerRef.current = setTimeout(() => retryReloadRef.current(), delay);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_subtasks' }, () => {
        debouncedFetchTaskSubtasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
        if (useAuthStore.getState().currentUser?.accessScope === 'related_only') debouncedFetchMembers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        debouncedFetchTickets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_items' }, () => {
        debouncedFetchEquipment();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_checkouts' }, () => {
        debouncedFetchEquipment();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accreditations' }, () => {
        debouncedFetchRenewals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        debouncedFetchRenewals();
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
      // A pending reload retry belongs to the account these channels were for;
      // a sign-out or account switch must not let it fire for the next one.
      clearTimeout(reloadRetryTimerRef.current);
      reloadRetryAttemptRef.current = 0;
      supabase.removeChannel(channel);
      if (accessChannel) supabase.removeChannel(accessChannel);
    };
    // Stable deps only — debounced callbacks use refs internally, so they never change.
    // loadNotifications is accessed via getState() to avoid dependency instability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);
}
