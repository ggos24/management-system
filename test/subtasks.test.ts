import { describe, expect, it } from 'vitest';
import { diffSubtaskChecks, parseSubtasks, toggleSubtaskInHtml } from '../lib/subtasks';

const row = (text: string, done = false) => `<div data-checklist="" data-checked="${done}">${text}</div>`;

describe('parseSubtasks', () => {
  it('returns null for a description without checklist rows', () => {
    expect(parseSubtasks('')).toBeNull();
    expect(parseSubtasks(undefined)).toBeNull();
    expect(parseSubtasks('<p>Just text</p><ul><li>bullet</li></ul>')).toBeNull();
  });

  it('counts rows and completed rows', () => {
    const summary = parseSubtasks(
      `<p>Intro</p>${row('Write lead', true)}${row('Find photo')}${row('Fact-check', true)}`,
    );
    expect(summary).toMatchObject({ done: 2, total: 3 });
    expect(summary?.items.map((i) => [i.index, i.text, i.done])).toEqual([
      [0, 'Write lead', true],
      [1, 'Find photo', false],
      [2, 'Fact-check', true],
    ]);
  });

  it('reads the legacy <input type="checkbox"> format', () => {
    const legacy =
      '<div><input type="checkbox" checked>Old done</div><div style="text-decoration: line-through"><input type="checkbox">Struck</div><div><input type="checkbox">Open</div>';
    expect(parseSubtasks(legacy)).toMatchObject({ done: 2, total: 3 });
  });

  it('counts rows nested by an earlier build once each', () => {
    const nested = `<div data-checklist="" data-checked="false">Outer<div data-checklist="" data-checked="true">Inner</div></div>`;
    const summary = parseSubtasks(nested);
    expect(summary?.items.map((i) => i.text)).toEqual(['Outer', 'Inner']);
    expect(summary?.done).toBe(1);
  });

  it('keys a row by its text without mention labels', () => {
    const summary = parseSubtasks(row('Call <span data-mention="p1">@Anna</span> today'));
    expect(summary?.items[0].key).toBe('Call today');
    expect(summary?.items[0].text).toBe('Call @Anna today');
  });
});

describe('toggleSubtaskInHtml', () => {
  const html = `${row('One')}${row('Two', true)}${row('Three')}`;

  it('flips the row at the index', () => {
    const next = toggleSubtaskInHtml(html, 0, 'One');
    expect(parseSubtasks(next)?.items.map((i) => i.done)).toEqual([true, true, false]);
    const back = toggleSubtaskInHtml(next, 1, 'Two');
    expect(parseSubtasks(back)?.items.map((i) => i.done)).toEqual([true, false, false]);
  });

  it('falls back to the text when the index points elsewhere', () => {
    const next = toggleSubtaskInHtml(html, 0, 'Three');
    expect(parseSubtasks(next)?.items.map((i) => i.done)).toEqual([false, true, true]);
  });

  it('matches a row whose mention carries a different label', () => {
    const stored = row('Ask <span data-mention="p1"></span> for sign-off');
    const next = toggleSubtaskInHtml(stored, 0, 'Ask for sign-off');
    expect(parseSubtasks(next)?.done).toBe(1);
  });

  it('returns null when the row does not exist', () => {
    expect(toggleSubtaskInHtml(html, 5, 'Missing')).toBeNull();
    expect(toggleSubtaskInHtml('<p>No list</p>', 0, 'One')).toBeNull();
  });
});

describe('diffSubtaskChecks', () => {
  const html = `<p>Intro</p>${row('One')}${row('Two', true)}`;

  it('lists the flipped rows when ticks are the only change', () => {
    const next = toggleSubtaskInHtml(toggleSubtaskInHtml(html, 0, 'One'), 1, 'Two');
    expect(diffSubtaskChecks(html, next)).toEqual([
      { text: 'One', done: true },
      { text: 'Two', done: false },
    ]);
  });

  it('returns null when anything else changed too', () => {
    const edited = toggleSubtaskInHtml(html, 0, 'One')!.replace('Intro', 'New intro');
    expect(diffSubtaskChecks(html, edited)).toBeNull();
    expect(diffSubtaskChecks(html, `${html}${row('Three')}`)).toBeNull();
    expect(diffSubtaskChecks('<p>a</p>', '<p>b</p>')).toBeNull();
    expect(diffSubtaskChecks(html, html)).toBeNull();
  });
});
