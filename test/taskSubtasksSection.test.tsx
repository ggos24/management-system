import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskSubtasksSection } from '../components/TaskSubtasksSection';
import type { Member, TaskSubtask } from '../types';

afterEach(cleanup);

describe('new task subtask draft', () => {
  it('collects one assignee and planned dates before the parent task exists', () => {
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
    fireEvent.change(screen.getByLabelText('Assignee'), { target: { value: 'member-1' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-02' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save subtask' }));
    expect(onDraftChange).toHaveBeenCalledWith([
      expect.objectContaining({
        taskId: '',
        title: 'Prepare brief',
        assigneeId: 'member-1',
        startDate: '2026-10-02',
        endDate: '2026-10-04',
        completed: false,
      }),
    ]);
  });
});
