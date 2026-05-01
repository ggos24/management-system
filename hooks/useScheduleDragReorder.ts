import { useState, useCallback } from 'react';

type DragType = 'team' | 'member' | null;
type DropPosition = 'before' | 'after';

interface DragState {
  dragType: DragType;
  draggedId: string | null;
  dragOverId: string | null;
  dropPosition: DropPosition | null;
}

interface UseScheduleDragReorderOptions {
  isAdminUser: boolean;
  onReorderTeams: (draggedId: string, targetId: string, position: DropPosition) => void;
  onReorderMembers: (teamId: string, draggedId: string, targetId: string, position: DropPosition) => void;
}

function getDropPosition(e: React.DragEvent): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
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
    dropPosition: null,
  });

  // --- Team drag handlers ---

  const handleTeamDragStart = useCallback(
    (e: React.DragEvent, teamId: string) => {
      if (!isAdminUser) return;
      e.dataTransfer.setData('text/plain', `schedule-team:${teamId}`);
      e.dataTransfer.effectAllowed = 'move';
      setDragState({ dragType: 'team', draggedId: teamId, dragOverId: null, dropPosition: null });
    },
    [isAdminUser],
  );

  const handleTeamDragOver = useCallback(
    (e: React.DragEvent, teamId: string) => {
      if (!isAdminUser || dragState.dragType !== 'team') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const position = getDropPosition(e);
      if (dragState.dragOverId !== teamId || dragState.dropPosition !== position) {
        setDragState((prev) => ({ ...prev, dragOverId: teamId, dropPosition: position }));
      }
    },
    [isAdminUser, dragState.dragType, dragState.dragOverId, dragState.dropPosition],
  );

  const handleTeamDrop = useCallback(
    (e: React.DragEvent, targetTeamId: string) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if (!data.startsWith('schedule-team:')) return;
      const draggedId = data.replace('schedule-team:', '');
      const position = getDropPosition(e);
      if (draggedId && draggedId !== targetTeamId) {
        onReorderTeams(draggedId, targetTeamId, position);
      }
      setDragState({ dragType: null, draggedId: null, dragOverId: null, dropPosition: null });
    },
    [onReorderTeams],
  );

  // --- Member drag handlers ---

  const handleMemberDragStart = useCallback(
    (e: React.DragEvent, teamId: string, memberId: string) => {
      if (!isAdminUser) return;
      e.dataTransfer.setData('text/plain', `schedule-member:${teamId}:${memberId}`);
      e.dataTransfer.effectAllowed = 'move';
      setDragState({ dragType: 'member', draggedId: memberId, dragOverId: null, dropPosition: null });
    },
    [isAdminUser],
  );

  const handleMemberDragOver = useCallback(
    (e: React.DragEvent, memberId: string) => {
      if (!isAdminUser || dragState.dragType !== 'member') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const position = getDropPosition(e);
      if (dragState.dragOverId !== memberId || dragState.dropPosition !== position) {
        setDragState((prev) => ({ ...prev, dragOverId: memberId, dropPosition: position }));
      }
    },
    [isAdminUser, dragState.dragType, dragState.dragOverId, dragState.dropPosition],
  );

  const handleMemberDrop = useCallback(
    (e: React.DragEvent, memberId: string) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      if (!data.startsWith('schedule-member:')) return;
      const parts = data.replace('schedule-member:', '').split(':');
      const teamId = parts[0];
      const draggedId = parts[1];
      const position = getDropPosition(e);
      if (draggedId && draggedId !== memberId) {
        onReorderMembers(teamId, draggedId, memberId, position);
      }
      setDragState({ dragType: null, draggedId: null, dragOverId: null, dropPosition: null });
    },
    [onReorderMembers],
  );

  // --- Shared ---

  const handleDragEnd = useCallback(() => {
    setDragState({ dragType: null, draggedId: null, dragOverId: null, dropPosition: null });
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
