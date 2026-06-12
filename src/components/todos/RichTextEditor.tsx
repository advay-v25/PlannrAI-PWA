'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Underline } from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, List, Table as TableIcon } from 'lucide-react';

interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
    minHeight?: string;
}

export function RichTextEditor({ content, onChange, placeholder = 'Take a note...', minHeight = '120px' }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
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
                class: `prose prose-sm prose-invert max-w-none focus:outline-none placeholder:text-white/30`,
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
        <div className="flex flex-col w-full h-full border border-white/10 rounded-xl overflow-hidden bg-black/20">
            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 bg-white/5 border-b border-white/10 overflow-x-auto">
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-1.5 rounded hover:bg-white/10 transition-colors ${editor.isActive('bold') ? 'bg-white/20 text-white' : 'text-white/60'}`}
                >
                    <Bold className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-1.5 rounded hover:bg-white/10 transition-colors ${editor.isActive('italic') ? 'bg-white/20 text-white' : 'text-white/60'}`}
                >
                    <Italic className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={`p-1.5 rounded hover:bg-white/10 transition-colors ${editor.isActive('underline') ? 'bg-white/20 text-white' : 'text-white/60'}`}
                >
                    <UnderlineIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`p-1.5 rounded hover:bg-white/10 transition-colors ${editor.isActive('bulletList') ? 'bg-white/20 text-white' : 'text-white/60'}`}
                >
                    <List className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/60"
                >
                    <TableIcon className="w-4 h-4" />
                </button>
            </div>
            
            {/* Editor Content */}
            <div className={`p-4 overflow-y-auto`} style={{ minHeight }}>
                {content === '' && editor.isEmpty && (
                    <div className="absolute text-white/30 pointer-events-none">
                        {placeholder}
                    </div>
                )}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
