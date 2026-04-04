import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import * as db from '../lib/database';

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

export function useRealtimeSync() {
  const storeRef = useRef(useDataStore);

  const debouncedFetchTasks = useDebouncedCallback(() => {
    const { setTasks, setDeletedTaskCount } = storeRef.current.getState();
    db.fetchTasks().then(setTasks).catch(console.error);
    db.fetchDeletedTaskCount().then(setDeletedTaskCount).catch(console.error);
  }, 300);

  const debouncedFetchMembers = useDebouncedCallback(() => {
    const { setMembers } = storeRef.current.getState();
    db.fetchMembers().then(setMembers).catch(console.error);
  }, 300);

  const debouncedFetchAbsences = useDebouncedCallback(() => {
    const { setAbsences } = storeRef.current.getState();
    db.fetchAbsences().then(setAbsences).catch(console.error);
  }, 300);

  const debouncedFetchShifts = useDebouncedCallback(() => {
    const { setShifts } = storeRef.current.getState();
    db.fetchShifts().then(setShifts).catch(console.error);
  }, 300);

  const debouncedFetchTaskTeamLinks = useDebouncedCallback(() => {
    const { setTaskTeamLinks } = storeRef.current.getState();
    db.fetchTaskTeamLinks().then(setTaskTeamLinks).catch(console.error);
  }, 300);

  const debouncedFetchTeamPlacements = useDebouncedCallback(() => {
    const { setTeamPlacements } = storeRef.current.getState();
    db.fetchTeamPlacements().then(setTeamPlacements).catch(console.error);
  }, 300);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        debouncedFetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_placements' }, () => {
        debouncedFetchTeamPlacements();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        useUiStore.getState().loadNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Stable deps only — debounced callbacks use refs internally, so they never change.
    // loadNotifications is accessed via getState() to avoid dependency instability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
