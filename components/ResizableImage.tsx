import React, { useCallback, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react';

// Size presets as percentage of container width
const SIZE_PRESETS = [
  { label: 'S', value: 25 },
  { label: 'M', value: 50 },
  { label: 'L', value: 75 },
  { label: 'Full', value: 100 },
];

const ALIGN_OPTIONS = [
  { icon: AlignLeft, value: 'left' as const },
  { icon: AlignCenter, value: 'center' as const },
  { icon: AlignRight, value: 'right' as const },
];

interface ImageNodeAttrs {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

const ImageNodeView: React.FC<{
  node: { attrs: ImageNodeAttrs };
  updateAttributes: (attrs: Partial<ImageNodeAttrs>) => void;
  deleteNode: () => void;
  selected: boolean;
}> = ({ node, updateAttributes, deleteNode, selected }) => {
  const { src, alt, title, width, align } = node.attrs;
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);

      const startX = e.clientX;
      const containerWidth = containerRef.current?.parentElement?.offsetWidth || 600;
      const startWidth = width || 100;

      const onMouseMove = (ev: MouseEvent) => {
        const diff = ev.clientX - startX;
        const diffPercent = (diff / containerWidth) * 100;
        const newWidth = Math.max(10, Math.min(100, startWidth + diffPercent));
        updateAttributes({ width: Math.round(newWidth) });
      };

      const onMouseUp = () => {
        setResizing(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [width, updateAttributes],
  );

  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  return (
    <NodeViewWrapper className={`flex ${justifyClass} my-3`} data-drag-handle>
      <div
        ref={containerRef}
        className="relative group inline-block"
        style={{ width: `${width || 100}%`, maxWidth: '100%' }}
      >
        <img
          src={src}
          alt={alt || ''}
          title={title || undefined}
          className={`block w-full h-auto rounded-lg ${
            selected ? 'ring-2 ring-blue-500' : ''
          } ${resizing ? 'pointer-events-none select-none' : ''}`}
          draggable={false}
        />

        {/* Toolbar — visible on selection */}
        {selected && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-lg p-1 shadow-lg z-10 whitespace-nowrap">
            {/* Size presets */}
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateAttributes({ width: preset.value });
                }}
                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                  width === preset.value || (!width && preset.value === 100)
                    ? 'bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900'
                    : 'text-zinc-400 dark:text-zinc-600 hover:text-white dark:hover:text-zinc-900'
                }`}
              >
                {preset.label}
              </button>
            ))}

            <div className="w-px h-4 bg-zinc-700 dark:bg-zinc-300 mx-0.5" />

            {/* Alignment */}
            {ALIGN_OPTIONS.map(({ icon: Icon, value }) => (
              <button
                key={value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateAttributes({ align: value });
                }}
                className={`p-1 rounded transition-colors ${
                  (align || 'center') === value
                    ? 'bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900'
                    : 'text-zinc-400 dark:text-zinc-600 hover:text-white dark:hover:text-zinc-900'
                }`}
              >
                <Icon size={12} />
              </button>
            ))}

            <div className="w-px h-4 bg-zinc-700 dark:bg-zinc-300 mx-0.5" />

            {/* Delete */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                deleteNode();
              }}
              className="p-1 rounded text-zinc-400 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-500 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}

        {/* Resize handle — bottom-right corner */}
        {selected && (
          <div
            onMouseDown={handleMouseDown}
            className="absolute bottom-1 right-1 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize opacity-80 hover:opacity-100 shadow"
          />
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: 100,
        parseHTML: (element) => {
          const w = element.style.width || element.getAttribute('data-width');
          return w ? parseInt(String(w), 10) || 100 : 100;
        },
        renderHTML: (attributes) => ({
          'data-width': attributes.width,
          style: `width: ${attributes.width}%`,
        }),
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { align, ...rest } = HTMLAttributes;
    const justifyStyle =
      align === 'left'
        ? 'display:flex;justify-content:flex-start;'
        : align === 'right'
          ? 'display:flex;justify-content:flex-end;'
          : 'display:flex;justify-content:center;';

    return [
      'figure',
      { style: justifyStyle, 'data-align': align },
      ['img', mergeAttributes(rest, { draggable: false })],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string; title?: string; width?: number; align?: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
