import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useDataStore } from '../stores/dataStore';
import * as db from '../lib/database';

export function useRealtimeSync() {
  const { setTasks, setMembers, setAbsences, setShifts } = useDataStore();

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setTasks, setMembers, setAbsences, setShifts]);
}
