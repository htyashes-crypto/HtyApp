import { useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Heading1, Heading2, Heading3, Heading4,
  List, ListOrdered, ListChecks,
  Quote, CodeSquare, Minus, Link as LinkIcon,
  Undo2, Redo2
} from "lucide-react";
import { renderMarkdown } from "../lib/composer-utils";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});

// Task list checkbox rule
turndown.addRule("taskListItem", {
  filter: (node) => {
    return node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem";
  },
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    const cleaned = content.replace(/^\n+/, "").replace(/\n+$/, "");
    return `- [${checked ? "x" : " "}] ${cleaned}\n`;
  }
});

export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  return renderMarkdown(md);
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown.turndown(html).trim();
}

interface MemoEditorProps {
  content: string; // markdown
  placeholder?: string;
  onChange: (markdown: string) => void;
}

export function MemoEditor({ content, placeholder, onChange }: MemoEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] }
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || "" })
    ],
    content: markdownToHtml(content),
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const md = htmlToMarkdown(html);
      onChange(md);
    }
  });

  // Sync external content changes (e.g., when switching memos)
  useEffect(() => {
    if (!editor) return;
    const currentMd = htmlToMarkdown(editor.getHTML());
    if (currentMd !== content) {
      editor.commands.setContent(markdownToHtml(content));
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="memo-editor">
      <EditorToolbar editor={editor} />
      <div className="memo-editor__body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const handleLink = useCallback(() => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("URL");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  return (
    <div className="memo-toolbar">
      <div className="memo-toolbar__group">
        <button
          type="button"
          className={editor.isActive("heading", { level: 1 }) ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        ><Heading1 size={16} /></button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        ><Heading2 size={16} /></button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 3 }) ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        ><Heading3 size={16} /></button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 4 }) ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          title="Heading 4"
        ><Heading4 size={16} /></button>
      </div>

      <span className="memo-toolbar__sep" />

      <div className="memo-toolbar__group">
        <button
          type="button"
          className={editor.isActive("bold") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        ><Bold size={16} /></button>
        <button
          type="button"
          className={editor.isActive("italic") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        ><Italic size={16} /></button>
        <button
          type="button"
          className={editor.isActive("underline") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        ><UnderlineIcon size={16} /></button>
        <button
          type="button"
          className={editor.isActive("strike") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        ><Strikethrough size={16} /></button>
        <button
          type="button"
          className={editor.isActive("code") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline Code"
        ><Code size={16} /></button>
      </div>

      <span className="memo-toolbar__sep" />

      <div className="memo-toolbar__group">
        <button
          type="button"
          className={editor.isActive("bulletList") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        ><List size={16} /></button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered List"
        ><ListOrdered size={16} /></button>
        <button
          type="button"
          className={editor.isActive("taskList") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Task List"
        ><ListChecks size={16} /></button>
      </div>

      <span className="memo-toolbar__sep" />

      <div className="memo-toolbar__group">
        <button
          type="button"
          className={editor.isActive("blockquote") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        ><Quote size={16} /></button>
        <button
          type="button"
          className={editor.isActive("codeBlock") ? "is-active" : ""}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code Block"
        ><CodeSquare size={16} /></button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        ><Minus size={16} /></button>
        <button
          type="button"
          className={editor.isActive("link") ? "is-active" : ""}
          onClick={handleLink}
          title="Link (Ctrl+K)"
        ><LinkIcon size={16} /></button>
      </div>

      <span className="memo-toolbar__sep" />

      <div className="memo-toolbar__group">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        ><Undo2 size={16} /></button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Shift+Z)"
        ><Redo2 size={16} /></button>
      </div>
    </div>
  );
}
