'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Underline } from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, List, Table as TableIcon, Trash2 } from 'lucide-react';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
    minHeight?: string;
    maxHeight?: string;
}

export function RichTextEditor({ 
    content, 
    onChange, 
    placeholder = 'Take a note...', 
    minHeight = '120px',
    maxHeight = '250px'
}: RichTextEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Underline.configure(),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: content,
        editorProps: {
            attributes: {
                class: `text-[var(--text-primary)] dark:text-white max-w-none focus:outline-none placeholder:text-[var(--text-muted)] dark:placeholder:text-white/30 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_table]:border-collapse [&_table]:w-full [&_table]:my-2 [&_td]:border [&_td]:border-[var(--glass-border)] dark:border-white/20 [&_td]:p-2 [&_th]:border [&_th]:border-[var(--glass-border)] dark:border-white/20 [&_th]:p-2 [&_th]:bg-[var(--glass-bg-active)] dark:bg-white/10 [&_th]:font-bold [&_th]:text-left`,
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
    });

    if (!editor) {
        return null;
    }

    return (
        <div className="flex flex-col w-full h-full border border-[var(--glass-border)] dark:border-white/10 rounded-xl overflow-hidden bg-[var(--glass-bg-active)] dark:bg-black/20">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 bg-[var(--glass-bg)] dark:bg-white/5 border-b border-[var(--glass-border)] dark:border-white/10">
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-1.5 rounded hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 transition-colors ${editor.isActive('bold') ? 'bg-[var(--glass-bg-active)] dark:bg-white/20 text-[var(--text-primary)] dark:text-white' : 'text-[var(--text-muted)] dark:text-white/60'}`}
                >
                    <Bold className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-1.5 rounded hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 transition-colors ${editor.isActive('italic') ? 'bg-[var(--glass-bg-active)] dark:bg-white/20 text-[var(--text-primary)] dark:text-white' : 'text-[var(--text-muted)] dark:text-white/60'}`}
                >
                    <Italic className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={`p-1.5 rounded hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 transition-colors ${editor.isActive('underline') ? 'bg-[var(--glass-bg-active)] dark:bg-white/20 text-[var(--text-primary)] dark:text-white' : 'text-[var(--text-muted)] dark:text-white/60'}`}
                >
                    <UnderlineIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-[var(--glass-border)] dark:bg-white/10 mx-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`p-1.5 rounded hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 transition-colors ${editor.isActive('bulletList') ? 'bg-[var(--glass-bg-active)] dark:bg-white/20 text-[var(--text-primary)] dark:text-white' : 'text-[var(--text-muted)] dark:text-white/60'}`}
                >
                    <List className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-[var(--glass-border)] dark:bg-white/10 mx-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    className="p-1.5 rounded hover:bg-[var(--glass-bg-hover)] dark:hover:bg-white/10 transition-colors text-[var(--text-muted)] dark:text-white/60"
                    title="Insert Table"
                >
                    <TableIcon className="w-4 h-4" />
                </button>
                {editor.isActive('table') && (
                    <>
                        <div className="w-px h-4 bg-[var(--glass-border)] dark:bg-white/10 mx-1" />
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().deleteTable().run()}
                            className="flex items-center gap-1 p-1.5 px-2 text-xs font-medium rounded hover:bg-red-500/20 text-red-400 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" /> Del Table
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().addRowAfter().run()}
                            className="p-1.5 px-2 text-xs font-medium rounded hover:bg-white/10 text-white/60 transition-colors"
                        >
                            + Row
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().addColumnAfter().run()}
                            className="p-1.5 px-2 text-xs font-medium rounded hover:bg-white/10 text-white/60 transition-colors"
                        >
                            + Col
                        </button>
                    </>
                )}
            </div>
            
            {/* Editor Content */}
            <div className="p-4 overflow-auto relative scrollbar-visible" style={{ minHeight, maxHeight }}>
                {content === '' && editor.isEmpty && (
                    <div className="absolute text-[var(--text-muted)] dark:text-white/30 pointer-events-none">
                        {placeholder}
                    </div>
                )}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
