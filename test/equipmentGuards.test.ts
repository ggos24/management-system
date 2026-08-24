import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deleting a profile SET NULLs its custody rows, so gear held by someone being
// offboarded would silently stop being tracked. The store refuses the delete
// while anything is still out, and marking a unit lost/retired is the escape
// hatch that closes the stranded checkout instead of deadlocking the guard.
const mocks = vi.hoisted(() => ({
  deleteMember: vi.fn(),
  checkinEquipment: vi.fn(),
  upsertEquipmentItem: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ then: () => undefined }) }) },
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() } }));

vi.mock('../lib/database', () => ({
  deleteMember: mocks.deleteMember,
  checkinEquipment: mocks.checkinEquipment,
  upsertEquipmentItem: mocks.upsertEquipmentItem,
  insertLog: () => Promise.resolve(),
  insertNotification: () => Promise.resolve(),
  insertNotifications: () => Promise.resolve(),
}));

const { useDataStore } = await import('../stores/dataStore');
const { useAuthStore } = await import('../stores/authStore');

const HOLDER = 'profile-holder';

function seed(options: { checkedInAt: string | null }) {
  useAuthStore.setState({
    currentUser: { id: 'profile-admin', name: 'Admin', role: 'admin', accessScope: 'full' } as never,
  });
  useDataStore.setState({
    members: [
      { id: HOLDER, name: 'Andriy', role: 'user', accessScope: 'full' },
      { id: 'profile-admin', name: 'Admin', role: 'admin', accessScope: 'full' },
    ] as never,
    equipmentItems: [{ id: 'item-1', assetCode: 'CAM-012', name: 'Sony FX6', status: 'active' }] as never,
    equipmentCheckouts: [
      {
        id: 'checkout-1',
        itemId: 'item-1',
        holderId: HOLDER,
        holderName: 'Andriy',
        checkedInAt: options.checkedInAt,
        needsRepair: false,
      },
    ] as never,
  });
}

beforeEach(() => {
  mocks.deleteMember.mockReset().mockResolvedValue({ error: null });
  mocks.checkinEquipment.mockReset().mockResolvedValue({
    id: 'checkout-1',
    itemId: 'item-1',
    holderId: HOLDER,
    holderName: 'Andriy',
    checkedInAt: '2026-08-24T10:00:00.000Z',
    needsRepair: false,
  });
  mocks.upsertEquipmentItem.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('offboarding guard', () => {
  it('refuses to delete a member who still holds equipment', () => {
    seed({ checkedInAt: null });

    useDataStore.getState().removeMember(HOLDER, 'profile-admin');

    expect(mocks.deleteMember).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('CAM-012'));
    expect(useDataStore.getState().members.some((member) => member.id === HOLDER)).toBe(true);
  });

  it('allows the delete once nothing is outstanding', () => {
    seed({ checkedInAt: '2026-08-24T09:00:00.000Z' });

    useDataStore.getState().removeMember(HOLDER, 'profile-admin');

    expect(mocks.deleteMember).toHaveBeenCalledWith(HOLDER);
    expect(useDataStore.getState().members.some((member) => member.id === HOLDER)).toBe(false);
  });
});

describe('lost/retired escape hatch', () => {
  it('closes a stranded checkout so the guard cannot deadlock', async () => {
    seed({ checkedInAt: null });
    mocks.upsertEquipmentItem.mockResolvedValue({
      id: 'item-1',
      assetCode: 'CAM-012',
      name: 'Sony FX6',
      status: 'lost',
    });

    await useDataStore.getState().saveEquipmentItem({ id: 'item-1', assetCode: 'CAM-012', status: 'lost' });

    expect(mocks.checkinEquipment).toHaveBeenCalledWith(
      'checkout-1',
      expect.objectContaining({ note: expect.any(String) }),
    );
  });

  it('leaves an open checkout alone for a non-terminal status', async () => {
    seed({ checkedInAt: null });
    mocks.upsertEquipmentItem.mockResolvedValue({
      id: 'item-1',
      assetCode: 'CAM-012',
      name: 'Sony FX6',
      status: 'maintenance',
    });

    await useDataStore.getState().saveEquipmentItem({ id: 'item-1', assetCode: 'CAM-012', status: 'maintenance' });

    expect(mocks.checkinEquipment).not.toHaveBeenCalled();
  });
});
