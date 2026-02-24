"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { Button } from "@/components/ui/button"
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

const PERSONALIZATION_PLACEHOLDERS = [
  { label: "First name", value: "{{firstName}}" },
  { label: "Email", value: "{{email}}" },
  { label: "Full name", value: "{{name}}" },
] as const

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  showPersonalization?: boolean
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = "Start writing your email content...",
  showPersonalization = true,
}: TiptapEditorProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg",
        },
      }),
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-4",
      },
    },
    immediatelyRender: false,
  })

  const setLink = useCallback(() => {
    if (!editor) return

    const previousUrl = editor.getAttributes("link").href
    const url = window.prompt("URL", previousUrl)

    if (url === null) {
      return
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  const insertPlaceholder = useCallback(
    (placeholder: string) => {
      if (!editor) return
      editor.chain().focus().insertContent(placeholder).run()
    },
    [editor]
  )

  const addImage = useCallback(() => {
    if (!editor) return

    const url = window.prompt("Image URL")

    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  // Don't render until mounted on client to avoid SSR hydration issues
  if (!isMounted || !editor) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="border-b p-2 flex flex-wrap gap-2 bg-muted/50">
          <div className="h-8 w-8 bg-muted animate-pulse rounded" />
          <div className="h-8 w-8 bg-muted animate-pulse rounded" />
          <div className="h-8 w-8 bg-muted animate-pulse rounded" />
        </div>
        <div className="min-h-[300px] bg-muted/20 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading editor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="border-b p-2 flex flex-wrap gap-2 bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "bg-muted" : ""}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "bg-muted" : ""}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "bg-muted" : ""}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? "bg-muted" : ""}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={setLink}
          className={editor.isActive("link") ? "bg-muted" : ""}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addImage}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        {showPersonalization && (
          <>
            <div className="w-px bg-border mx-1" />
            <div className="flex items-center gap-1">
              {PERSONALIZATION_PLACEHOLDERS.map(({ label, value }) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => insertPlaceholder(value)}
                  title={`Insert ${label}`}
                  className="text-xs font-mono"
                >
                  {value}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
      <EditorContent editor={editor} className="min-h-[300px] max-h-[600px] overflow-y-auto" />
    </div>
  )
}
