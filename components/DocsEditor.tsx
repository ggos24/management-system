import React, { useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ResizableImage } from './ResizableImage';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Image as ImageIcon,
  Link as LinkIcon,
  Table as TableIcon,
  Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocImage } from '../lib/database';

const MAX_IMAGE_SIZE_MB = 5;

interface DocsEditorProps {
  content: Record<string, unknown>;
  onChange: (json: Record<string, unknown>, html: string) => void;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    title={title}
    className={`p-1.5 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
      active
        ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-900 dark:text-white'
        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
    }`}
  >
    {children}
  </button>
);

const Sep = () => <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />;

export const DocsEditor: React.FC<DocsEditorProps> = ({ content, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      ResizableImage,
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: content && Object.keys(content).length > 0 ? content : undefined,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as Record<string, unknown>, e.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'docs-prose outline-none min-h-[400px] p-4 text-sm leading-relaxed',
      },
    },
  });

  const handleImageUpload = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        toast.error(`Image must be under ${MAX_IMAGE_SIZE_MB} MB`);
        e.target.value = '';
        return;
      }
      let url: string | null = null;
      try {
        url = await uploadDocImage(file);
      } catch {
        // Storage upload failed — use base64 fallback
      }
      if (!url) {
        try {
          url = await toBase64(file);
        } catch {
          // base64 also failed — give up
        }
      }
      if (url) {
        (editor.chain().focus() as any).setImage({ src: url }).run();
      }
      e.target.value = '';
    },
    [editor],
  );

  const handleLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden focus-within:ring-1 focus-within:ring-zinc-400">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b border-zinc-200 dark:border-zinc-700 p-1.5 bg-zinc-50 dark:bg-zinc-800/50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={16} />
        </ToolbarButton>
        <Sep />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </ToolbarButton>
        <Sep />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="Code Block"
        >
          <Code size={16} />
        </ToolbarButton>
        <Sep />
        <ToolbarButton onClick={handleImageUpload} title="Insert Image">
          <ImageIcon size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={handleLink} active={editor.isActive('link')} title="Insert Link">
          <LinkIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert Table"
        >
          <TableIcon size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus size={16} />
        </ToolbarButton>
      </div>

      {/* Bubble menu on text selection */}
      <BubbleMenu editor={editor}>
        <div className="flex items-center gap-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-lg p-1 shadow-lg">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleBold().run();
            }}
            className={`p-1 rounded ${editor.isActive('bold') ? 'bg-zinc-700 dark:bg-zinc-300' : ''} text-white dark:text-zinc-900`}
          >
            <Bold size={14} />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleItalic().run();
            }}
            className={`p-1 rounded ${editor.isActive('italic') ? 'bg-zinc-700 dark:bg-zinc-300' : ''} text-white dark:text-zinc-900`}
          >
            <Italic size={14} />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleLink();
            }}
            className={`p-1 rounded ${editor.isActive('link') ? 'bg-zinc-700 dark:bg-zinc-300' : ''} text-white dark:text-zinc-900`}
          >
            <LinkIcon size={14} />
          </button>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
    </div>
  );
};
