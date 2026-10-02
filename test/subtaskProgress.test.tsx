import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubtaskList, SubtaskProgress, SubtaskSummaryBar } from '../components/SubtaskProgress';
import { subtaskProgress } from '../lib/taskSubtasks';
import { parseSubtasks, toggleSubtaskInHtml } from '../lib/subtasks';
import type { Member, TaskSubtask } from '../types';

const items: TaskSubtask[] = [
  {
    id: 'one',
    taskId: 'task',
    title: 'Write lead',
    assigneeId: 'member-1',
    createdAt: '2026-10-01T10:00:00Z',
    startDate: '2026-10-02',
    endDate: '2026-10-03',
    completed: true,
  },
  {
    id: 'two',
    taskId: 'task',
    title: 'Find photo',
    assigneeId: null,
    createdAt: '2026-10-01T11:00:00Z',
    startDate: null,
    endDate: null,
    completed: false,
  },
];
const member = { id: 'member-1', name: 'Anna' } as Member;

afterEach(cleanup);

describe('structured subtask progress', () => {
  it('uses stored subtasks and does not derive progress from description checklists', () => {
    const oldDescription = '<div><input type="checkbox" checked>Legacy checklist</div>';
    const newDescription = '<div data-checklist="" data-checked="false">New checklist</div>';
    expect(parseSubtasks(oldDescription)?.done).toBe(1);
    expect(parseSubtasks(toggleSubtaskInHtml(newDescription, 0, 'New checklist'))?.done).toBe(1);
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0 });
    expect(subtaskProgress(items)).toEqual({ done: 1, total: 2 });
    expect(
      render(<SubtaskProgress subtasks={[]} expanded={false} onExpand={vi.fn()} />).container,
    ).toBeEmptyDOMElement();
  });

  it('opens an inline list without opening the parent card', () => {
    const onCardClick = vi.fn();
    const onExpand = vi.fn();
    render(
      <div onClick={onCardClick}>
        <SubtaskProgress subtasks={items} expanded={false} onExpand={onExpand} />
      </div>,
    );
    const chip = screen.getByRole('button', { name: 'Subtasks: 1 of 2 done' });
    expect(chip).toHaveTextContent('1/2');
    fireEvent.click(chip);
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onCardClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows a restricted assignee to complete only their own row', () => {
    const onToggle = vi.fn();
    render(
      <SubtaskList
        subtasks={items}
        members={[member]}
        currentUserId="member-1"
        canEditAll={false}
        onToggle={onToggle}
      />,
    );
    const own = screen.getByRole('checkbox', { name: 'Complete Write lead' });
    const other = screen.getByRole('checkbox', { name: 'Complete Find photo' });
    expect(own).toBeEnabled();
    expect(other).toBeDisabled();
    fireEvent.click(own);
    expect(onToggle).toHaveBeenCalledWith('one', false);
  });

  it('shows a summary only when stored subtasks exist', () => {
    const { container, rerender } = render(<SubtaskSummaryBar subtasks={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SubtaskSummaryBar subtasks={items} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });
});
