import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubtaskProgress, SubtaskSummaryBar } from '../components/SubtaskProgress';

const row = (text: string, done = false) => `<div data-checklist="" data-checked="${done}">${text}</div>`;
const description = `${row('Write lead', true)}${row('Find photo')}`;

beforeAll(() => {
  // jsdom has no ResizeObserver; the popover positioning hook only needs it to exist.
  if (!('ResizeObserver' in window)) {
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    });
  }
});

afterEach(cleanup);

describe('SubtaskProgress', () => {
  it('renders nothing without checklist rows', () => {
    const { container } = render(<SubtaskProgress description="<p>No list</p>" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows done/total and keeps its clicks away from the card', async () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <SubtaskProgress description={description} onToggle={vi.fn()} />
      </div>,
    );
    const chip = screen.getByRole('button', { name: 'Subtasks: 1 of 2 done' });
    expect(chip).toHaveTextContent('1/2');
    fireEvent.click(chip);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Subtasks' })).toBeInTheDocument();
  });

  it('ticks an item from the popover without opening the card', async () => {
    const onCardClick = vi.fn();
    const onToggle = vi.fn();
    render(
      <div onClick={onCardClick}>
        <SubtaskProgress description={description} onToggle={onToggle} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Subtasks:/ }));
    const item = await screen.findByRole('checkbox', { name: 'Find photo' });
    expect(item).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith(1, 'Find photo');
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('is read-only without onToggle', async () => {
    render(<SubtaskProgress description={description} />);
    fireEvent.click(screen.getByRole('button', { name: /Subtasks:/ }));
    for (const item of await screen.findAllByRole('checkbox')) expect(item).toBeDisabled();
  });
});

describe('SubtaskSummaryBar', () => {
  it('shows the header only when there are subtasks', () => {
    const { container, rerender } = render(<SubtaskSummaryBar description="<p>none</p>" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SubtaskSummaryBar description={description} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });
});
