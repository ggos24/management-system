import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from '../components/RichTextEditor';

afterEach(() => cleanup());

const editorOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[contenteditable="true"]')!;

describe('RichTextEditor value sync', () => {
  it('shows an outside value even when the parent never echoed the last typed one', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<RichTextEditor value="<p>Draft</p>" onChange={onChange} />);
    const editor = editorOf(container);

    editor.innerHTML = '<p>Draft, typed</p>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith('<p>Draft, typed</p>');

    // A colleague's text is merged in from outside before the parent re-rendered
    // with what was typed. The editor must show it, or the next keystroke would
    // send back the stale text.
    rerender(<RichTextEditor value="<p>From a colleague</p>" onChange={onChange} />);

    expect(editor.innerHTML).toBe('<p>From a colleague</p>');
  });

  it('leaves the DOM alone when the value is its own last edit coming back', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<RichTextEditor value="<p>Draft</p>" onChange={onChange} />);
    const editor = editorOf(container);
    editor.innerHTML = '<p>Draft, typed</p>';
    const typedNode = editor.firstChild;
    fireEvent.input(editor);

    rerender(<RichTextEditor value="<p>Draft, typed</p>" onChange={onChange} />);

    // Same node: nothing was re-rendered under the caret.
    expect(editor.firstChild).toBe(typedNode);
  });
});
