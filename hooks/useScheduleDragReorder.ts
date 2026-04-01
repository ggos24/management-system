import { useState, useCallback } from 'react';

type DragType = 'team' | 'member' | null;

interface DragState {
  dragType: DragType;
  draggedId: string | null;
  dragOverId: string | null;
}

interface UseScheduleDragReorderOptions {
  isAdminUser: boolean;
  onReorderTeams: (draggedId: string, targetId: string) => void;
  onReorderMembers: (teamId: string, draggedId: string, targetId: string) => void;
}

export function useScheduleDragReorder({
  isAdminUser,
  onReorderTeams,
  onReorderMembers,
}: UseScheduleDragReorderOptions) {
  const [dragState, setDragState] = useState<DragState>({
    dragType: null,
    draggedId: null,
    dragOverId: null,
  });

  // --- Team drag handlers ---

  const handleTeamDragStart = useCallback(
    (e: React.DragEvent, teamId: string) => {
      if (!isAdminUser) return;
      e.dataTransfer.setData('text/plain', `schedule-team:${teamId}`);
      e.dataTransfer.effectAllowed = 'move';
      setDragState({ dragType: 'team', draggedId: teamId, dragOverId: null });
    },
    [isAdminUser],
  );

  const handleTeamDragOver = useCallback(
    (e: React.DragEvent, teamId: string) => {
      if (!isAdminUser || dragState.dragType !== 'team') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragState.dragOverId !== teamId) {
        setDragState((prev) => ({ ...prev, dragOverId: teamId }));
      }
    },
    [isAdminUser, dragState.dragType, dragState.dragOverId],
  );

  const handleTeamDrop = useCallback(
    (e: React.DragEvent, targetTeamId: string) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if (!data.startsWith('schedule-team:')) return;
      const draggedId = data.replace('schedule-team:', '');
      if (draggedId && draggedId !== targetTeamId) {
        onReorderTeams(draggedId, targetTeamId);
      }
      setDragState({ dragType: null, draggedId: null, dragOverId: null });
    },
    [onReorderTeams],
  );

  // --- Member drag handlers ---

  const handleMemberDragStart = useCallback(
    (e: React.DragEvent, teamId: string, memberId: string) => {
      if (!isAdminUser) return;
      e.dataTransfer.setData('text/plain', `schedule-member:${teamId}:${memberId}`);
      e.dataTransfer.effectAllowed = 'move';
      setDragState({ dragType: 'member', draggedId: memberId, dragOverId: null });
    },
    [isAdminUser],
  );

  const handleMemberDragOver = useCallback(
    (e: React.DragEvent, memberId: string) => {
      if (!isAdminUser || dragState.dragType !== 'member') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragState.dragOverId !== memberId) {
        setDragState((prev) => ({ ...prev, dragOverId: memberId }));
      }
    },
    [isAdminUser, dragState.dragType, dragState.dragOverId],
  );

  const handleMemberDrop = useCallback(
    (e: React.DragEvent, memberId: string) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if (!data.startsWith('schedule-member:')) return;
      const parts = data.replace('schedule-member:', '').split(':');
      const teamId = parts[0];
      const draggedId = parts[1];
      if (draggedId && draggedId !== memberId) {
        onReorderMembers(teamId, draggedId, memberId);
      }
      setDragState({ dragType: null, draggedId: null, dragOverId: null });
    },
    [onReorderMembers],
  );

  // --- Shared ---

  const handleDragEnd = useCallback(() => {
    setDragState({ dragType: null, draggedId: null, dragOverId: null });
  }, []);

  return {
    dragState,
    handleTeamDragStart,
    handleTeamDragOver,
    handleTeamDrop,
    handleMemberDragStart,
    handleMemberDragOver,
    handleMemberDrop,
    handleDragEnd,
  };
}
