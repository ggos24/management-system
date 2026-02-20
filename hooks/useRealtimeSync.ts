import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import * as db from '../lib/database';

export function useRealtimeSync() {
  const { setTasks, setMembers, setAbsences, setShifts } = useDataStore();
  const loadNotifications = useUiStore((s) => s.loadNotifications);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        // Refetch tasks on any change (insert/update/delete)
        db.fetchTasks().then(setTasks).catch(console.error);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        db.fetchMembers().then(setMembers).catch(console.error);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => {
        db.fetchAbsences().then(setAbsences).catch(console.error);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        db.fetchShifts().then(setShifts).catch(console.error);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        loadNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setTasks, setMembers, setAbsences, setShifts, loadNotifications]);
}
