import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import { TaskSubtasksSection } from '../components/TaskSubtasksSection';
import type { Member, TaskSubtask } from '../types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('new task subtask draft', () => {
  it('uses the searchable person picker and calendar controls for draft subtasks', async () => {
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const onDraftChange = vi.fn<(items: TaskSubtask[]) => void>();
    const member = { id: 'member-1', name: 'Anna', accessScope: 'full' } as Member;
    render(
      <TaskSubtasksSection
        taskId={undefined}
        deleted={false}
        readOnly={false}
        currentUserId="member-1"
        members={[member]}
        draftSubtasks={[]}
        onDraftChange={onDraftChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add subtask/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Prepare brief' } });

    fireEvent.click(screen.getByText('Unassigned'));
    fireEvent.change(await screen.findByPlaceholderText('Search...'), { target: { value: 'Anna' } });
    const selfOption = screen.getByText('Anna');
    expect(selfOption.parentElement).toHaveClass('bg-blue-50');
    fireEvent.click(selfOption);

    fireEvent.click(screen.getByRole('button', { name: 'Set start date' }));
    await waitFor(() => expect(document.querySelector('[data-state="open"]')).toBeInTheDocument());
    fireEvent.click(
      within(document.querySelector('[data-state="open"]') as HTMLElement).getByRole('button', { name: '2' }),
    );
    await waitForElementToBeRemoved(() => document.querySelector('[data-state="closed"]'));

    fireEvent.click(screen.getByRole('button', { name: 'Set end date' }));
    await waitFor(() => expect(document.querySelector('[data-state="open"]')).toBeInTheDocument());
    fireEvent.click(
      within(document.querySelector('[data-state="open"]') as HTMLElement).getByRole('button', { name: '4' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save subtask' }));
    expect(onDraftChange).toHaveBeenCalledWith([
      expect.objectContaining({
        taskId: '',
        title: 'Prepare brief',
        assigneeId: 'member-1',
        startDate: `${month}-02`,
        endDate: `${month}-04`,
        completed: false,
      }),
    ]);
  });
});
