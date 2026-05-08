import type { StatusCategory, TeamStatus } from '../types';

export function getStatusName(
  teamStatuses: Record<string, TeamStatus[]>,
  teamId: string,
  statusId: string | null,
): string {
  if (!statusId) return 'No status';
  return teamStatuses[teamId]?.find((s) => s.id === statusId)?.name ?? 'Unknown';
}

export function getStatusCategory(
  teamStatuses: Record<string, TeamStatus[]>,
  teamId: string,
  statusId: string | null,
): StatusCategory {
  if (!statusId) return 'active';
  return teamStatuses[teamId]?.find((s) => s.id === statusId)?.category ?? 'active';
}

export function findStatusByName(
  teamStatuses: Record<string, TeamStatus[]>,
  teamId: string,
  name: string,
): TeamStatus | undefined {
  return teamStatuses[teamId]?.find((s) => s.name === name);
}
