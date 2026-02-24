"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { addHours, addDays, nextMonday, setHours, setMinutes } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TiptapEditor } from "@/components/emails/tiptap-editor"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload } from "lucide-react"
import { toast } from "sonner"

const DRAFT_STORAGE_KEY = "campaign-draft"
const DRAFT_DEBOUNCE_MS = 30_000

// Helper function to parse emails from textarea input
function parseEmails(input: string): string[] {
  if (!input.trim()) return []

  // Split by commas, newlines, or spaces, then filter and trim
  return input
    .split(/[,\n\s]+/)
    .map(email => email.trim())
    .filter(email => email.length > 0)
}

// Helper function to validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function suggestSubjectFromBody(body: string): string {
  if (!body?.trim()) return ""
  const stripped = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim()
  const firstLine = stripped.split(/\n/)[0]?.trim() || ""
  const first50 = firstLine.slice(0, 50)
  return first50.length < firstLine.length ? first50 + "..." : first50
}

function parseCsvForEmails(text: string): string[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return []

  const headerLine = lines[0]
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase())
  const emailColIndex = headers.findIndex((h) => h === "email" || h === "e-mail")
  if (emailColIndex === -1) return []

  const emails: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim())
    const email = values[emailColIndex]
    if (email && isValidEmail(email)) {
      emails.push(email)
    }
  }
  return [...new Set(emails)]
}

const campaignSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  scheduledAt: z.string().datetime().optional().nullable(),
  recipientsText: z.string().min(1, "At least one recipient is required").refine(
    (text) => {
      const emails = parseEmails(text)
      return emails.length > 0 && emails.every(email => isValidEmail(email))
    },
    {
      message: "Please enter valid email addresses separated by commas or new lines",
    }
  ),
})

type CampaignFormData = z.infer<typeof campaignSchema>

async function createCampaign(data: CampaignFormData) {
  // Parse recipients from textarea and transform to API format
  const emails = parseEmails(data.recipientsText)
  const recipients = emails.map(email => ({
    recipientEmail: email,
  }))

  const response = await fetch("/api/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: data.subject,
      body: data.body,
      scheduledAt: data.scheduledAt,
      recipients,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to create campaign")
  }

  return response.json()
}

interface CampaignFormProps {
  defaultValues?: {
    subject?: string
    body?: string
    scheduledAt?: string | Date | null
    recipientsText?: string
    recipients?: Array<{ recipientEmail: string }>
  }
  onSubmit?: (data: CampaignFormData) => Promise<void>
  onSuccess?: () => void
}

function getSchedulePresetDatetime(preset: "now" | "1h" | "tomorrow" | "next-monday"): Date {
  const now = new Date()
  switch (preset) {
    case "now":
      return now
    case "1h":
      return addHours(now, 1)
    case "tomorrow": {
      const tomorrow = addDays(now, 1)
      return setMinutes(setHours(tomorrow, 9), 0)
    }
    case "next-monday": {
      const monday = nextMonday(now)
      return setMinutes(setHours(monday, 9), 0)
    }
    default:
      return now
  }
}

export function CampaignForm({ defaultValues, onSubmit, onSuccess }: CampaignFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [timeInputValue, setTimeInputValue] = useState<string>("")
  const [restoreDraftOpen, setRestoreDraftOpen] = useState(false)
  const [saveListOpen, setSaveListOpen] = useState(false)
  const [saveListName, setSaveListName] = useState("")
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState("")
  const [selectedListId, setSelectedListId] = useState<string>("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [step, setStep] = useState(0)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const draftCheckedRef = useRef(false)

  const STEPS = ["Details", "Recipients", "Body", "Schedule", "Review"] as const
  const maxStep = STEPS.length - 1

  const { data: recipientListsData } = useQuery({
    queryKey: ["recipient-lists"],
    queryFn: async () => {
      const res = await fetch("/api/recipient-lists")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      return json.data as Array<{
        id: string
        name: string
        entries: Array<{ recipientEmail: string; recipientName?: string | null }>
      }>
    },
  })

  const { data: templatesData } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      return json.data as Array<{
        id: string
        name: string
        subject: string
        body: string
      }>
    },
  })

  const recipientLists = recipientListsData ?? []
  const templates = templatesData ?? []

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema as any),
    defaultValues: {
      subject: defaultValues?.subject || "",
      body: defaultValues?.body || "",
      scheduledAt: defaultValues?.scheduledAt ? new Date(defaultValues.scheduledAt).toISOString() : null,
      recipientsText: defaultValues?.recipientsText
        ? defaultValues.recipientsText
        : defaultValues?.recipients
          ? defaultValues.recipients.map(r => r.recipientEmail).join("\n")
          : "",
    },
  })

  const body = watch("body")
  const scheduledAt = watch("scheduledAt")
  const subject = watch("subject")
  const recipientsText = watch("recipientsText")

  // Restore draft prompt on mount (only when no defaultValues)
  useEffect(() => {
    if (draftCheckedRef.current || Object.keys(defaultValues || {}).length > 0) return
    draftCheckedRef.current = true

    if (typeof window === "undefined") return
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!stored) return

    try {
      const draft = JSON.parse(stored) as Partial<CampaignFormData>
      const hasContent = (draft.subject && draft.subject.trim()) ||
        (draft.body && draft.body.trim()) ||
        (draft.recipientsText && parseEmails(draft.recipientsText).length > 0)
      if (hasContent) setRestoreDraftOpen(true)
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  }, [defaultValues])

  const clearDraft = useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(DRAFT_STORAGE_KEY)
  }, [])

  const restoreDraft = useCallback(() => {
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!stored) return
    try {
      const draft = JSON.parse(stored) as Partial<CampaignFormData>
      if (draft.subject && draft.subject.trim()) setValue("subject", draft.subject)
      if (draft.body && draft.body.trim()) setValue("body", draft.body)
      if (draft.recipientsText && draft.recipientsText.trim()) setValue("recipientsText", draft.recipientsText)
      if (draft.scheduledAt) setValue("scheduledAt", draft.scheduledAt)
      setRestoreDraftOpen(false)
      clearDraft()
    } catch {
      clearDraft()
    }
  }, [setValue, clearDraft])

  const discardDraft = useCallback(() => {
    setRestoreDraftOpen(false)
    clearDraft()
  }, [clearDraft])

  // Draft auto-save (debounced)
  useEffect(() => {
    const hasContent = (subject && subject.trim()) ||
      (body && body.trim()) ||
      (recipientsText && parseEmails(recipientsText).length > 0)
    if (!hasContent) return

    const timer = setTimeout(() => {
      if (typeof window === "undefined") return
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        subject: subject || "",
        body: body || "",
        recipientsText: recipientsText || "",
        scheduledAt: scheduledAt || null,
      }))
    }, DRAFT_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [subject, body, recipientsText, scheduledAt])

  // Sync time input value with scheduledAt
  useEffect(() => {
    if (scheduledAt) {
      setTimeInputValue(new Date(scheduledAt).toTimeString().slice(0, 5))
    } else {
      setTimeInputValue("")
    }
  }, [scheduledAt])

  // Clear selected list when recipients are cleared
  useEffect(() => {
    if (!recipientsText || parseEmails(recipientsText).length === 0) {
      setSelectedListId("")
    }
  }, [recipientsText])

  const applySchedulePreset = useCallback((preset: "now" | "1h" | "tomorrow" | "next-monday") => {
    const datetime = getSchedulePresetDatetime(preset)
    setValue("scheduledAt", datetime.toISOString())
    setCalendarOpen(false)
  }, [setValue])

  const saveListMutation = useMutation({
    mutationFn: async (name: string) => {
      const emails = parseEmails(recipientsText || "")
      if (emails.length === 0) throw new Error("No valid emails to save")
      const res = await fetch("/api/recipient-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emails }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to save list")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient-lists"] })
      toast.success("Recipient list saved")
      setSaveListOpen(false)
      setSaveListName("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject: subject || "",
          body: body || "",
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to save template")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
      toast.success("Template saved")
      setSaveTemplateOpen(false)
      setSaveTemplateName("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSaveAsTemplate = () => {
    if (!saveTemplateName.trim()) {
      toast.error("Enter a name for the template")
      return
    }
    if (!subject?.trim() || !body?.trim()) {
      toast.error("Subject and body are required to save as template")
      return
    }
    saveTemplateMutation.mutate(saveTemplateName.trim())
  }

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/emails/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || "",
          body: body || "",
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to send test")
      }
      return res.json()
    },
    onSuccess: (data: { message?: string }) => {
      toast.success(data.message || "Test email sent")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSaveAsList = () => {
    if (!saveListName.trim()) {
      toast.error("Enter a name for the list")
      return
    }
    saveListMutation.mutate(saveListName.trim())
  }

  const handleSelectTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      setValue("subject", template.subject)
      setValue("body", template.body)
      setSelectedTemplateId(templateId)
    }
  }

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const emails = parseCsvForEmails(text)
      if (emails.length === 0) {
        toast.error("No valid emails found in CSV. Ensure file has an 'email' or 'Email' column.")
        return
      }
      const existing = parseEmails(recipientsText || "")
      const combined = [...new Set([...existing, ...emails])]
      setValue("recipientsText", combined.join("\n"))
      toast.success(`Imported ${emails.length} email(s) from CSV`)
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleSuggestSubject = () => {
    const suggested = suggestSubjectFromBody(body || "")
    if (suggested) setValue("subject", suggested)
    else toast.error("Add some body content first")
  }

  const handleRemoveDuplicates = () => {
    const emails = parseEmails(recipientsText || "")
    const unique = [...new Set(emails)]
    if (unique.length < emails.length) {
      setValue("recipientsText", unique.join("\n"))
      toast.success(`Removed ${emails.length - unique.length} duplicate(s)`)
    } else {
      toast.info("No duplicates found")
    }
  }

  const handleSelectRecipientList = (listId: string) => {
    const list = recipientLists.find((l) => l.id === listId)
    if (list) {
      setValue("recipientsText", list.entries.map((e) => e.recipientEmail).join("\n"))
      setSelectedListId(listId)
    }
  }

  const createMutation = useMutation({
    mutationFn: onSubmit || createCampaign,
    onSuccess: () => {
      clearDraft()
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] })
      toast.success("Campaign created successfully")
      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/dashboard")
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create campaign")
    },
  })

  const onFormSubmit = async (data: CampaignFormData) => {
    createMutation.mutate(data)
  }

  return (
    <>
      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Start from template</CardTitle>
            <CardDescription>
              Use a saved template to pre-fill subject and body
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedTemplateId || "__none__"}
              onValueChange={(v) =>
                v === "__none__" ? setSelectedTemplateId("") : handleSelectTemplate(v)
              }
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose a template...</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved draft from a previous session. Would you like to restore it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Discard</AlertDialogCancel>
            <AlertDialogAction onClick={restoreDraft}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  step === i
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "bg-muted text-muted-foreground hover:bg-muted/80"
                      : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {i + 1}. {label}
              </button>
              {i < maxStep && <span className="text-muted-foreground">›</span>}
            </div>
          ))}
        </div>

        {step === 0 && (
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
          <CardDescription>
            Enter the subject for your email campaign
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line</Label>
            <Input
              id="subject"
              placeholder="e.g., Special Offer - 50% Off!"
              {...register("subject")}
              aria-invalid={errors.subject ? "true" : "false"}
            />
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject.message}</p>
            )}
          </div>
        </CardContent>
      </Card>
        )}

        {step === 1 && (
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Enter email addresses separated by commas or new lines. You can paste multiple emails at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Saved lists</Label>
            <div className="flex gap-2">
              <Select
                value={selectedListId || "__none__"}
                onValueChange={(v) => (v === "__none__" ? setSelectedListId("") : handleSelectRecipientList(v))}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Select from saved list..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select from saved list...</SelectItem>
                  {recipientLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.entries.length} recipients)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSaveListOpen(true)}
                disabled={!recipientsText || parseEmails(recipientsText).length === 0}
              >
                Save as new list
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoveDuplicates}
                disabled={!recipientsText || parseEmails(recipientsText).length === 0}
              >
                Remove duplicates
              </Button>
            </div>
          </div>
          <Dialog open={saveListOpen} onOpenChange={setSaveListOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save recipient list</DialogTitle>
                <DialogDescription>
                  Give this list a name to reuse it in future campaigns.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="list-name">List name</Label>
                  <Input
                    id="list-name"
                    placeholder="e.g., Newsletter subscribers"
                    value={saveListName}
                    onChange={(e) => setSaveListName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSaveListOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveAsList}
                  disabled={!saveListName.trim() || saveListMutation.isPending}
                >
                  {saveListMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="space-y-2">
            <Label htmlFor="recipientsText">Email Addresses</Label>
            <Textarea
              id="recipientsText"
              placeholder="recipient1@example.com, recipient2@example.com&#10;recipient3@example.com&#10;recipient4@example.com"
              rows={8}
              {...register("recipientsText")}
              aria-invalid={errors.recipientsText ? "true" : "false"}
              className="font-mono text-sm"
            />
            {errors.recipientsText && (
              <p className="text-sm text-destructive">
                {errors.recipientsText.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: You can paste a list of emails separated by commas, spaces, or new lines. Invalid emails will be highlighted.
            </p>
          </div>
        </CardContent>
      </Card>
        )}

        {step === 2 && (
      <Card>
        <CardHeader>
          <CardTitle>Email Body</CardTitle>
          <CardDescription>
            Write the content for your email campaign
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSuggestSubject}
              disabled={!body?.trim()}
            >
              Suggest subject from body
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSaveTemplateOpen(true)}
              disabled={!subject?.trim() || !body?.trim()}
            >
              Save as template
            </Button>
          </div>
          <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save as template</DialogTitle>
                <DialogDescription>
                  Save this subject and body as a reusable template for future campaigns.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template name</Label>
                  <Input
                    id="template-name"
                    placeholder="e.g., Monthly newsletter"
                    value={saveTemplateName}
                    onChange={(e) => setSaveTemplateName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveAsTemplate}
                  disabled={!saveTemplateName.trim() || saveTemplateMutation.isPending}
                >
                  {saveTemplateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="space-y-2">
            <TiptapEditor
              content={body}
              onChange={(content) => setValue("body", content)}
              placeholder="Write your email content here..."
            />
            {errors.body && (
              <p className="text-sm text-destructive">{errors.body.message}</p>
            )}
          </div>
        </CardContent>
      </Card>
        )}

        {step === 3 && (
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            Optionally schedule this campaign for later
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Quick presets</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applySchedulePreset("now")}
                disabled={isSubmitting || createMutation.isPending}
              >
                Send now
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applySchedulePreset("1h")}
                disabled={isSubmitting || createMutation.isPending}
              >
                In 1 hour
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applySchedulePreset("tomorrow")}
                disabled={isSubmitting || createMutation.isPending}
              >
                Tomorrow 9 AM
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applySchedulePreset("next-monday")}
                disabled={isSubmitting || createMutation.isPending}
              >
                Next Monday 9 AM
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Schedule Date & Time</Label>
            <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" type="button" className="w-full">
                  {scheduledAt
                    ? new Date(scheduledAt).toLocaleString()
                    : "Not scheduled"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Select Date & Time</DialogTitle>
                  <DialogDescription>
                    Choose when to send this campaign
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Calendar
                    mode="single"
                    selected={scheduledAt ? new Date(scheduledAt) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const datetime = new Date(date)
                        const now = new Date()
                        const selectedDate = new Date(date)
                        selectedDate.setHours(0, 0, 0, 0)
                        const today = new Date(now)
                        today.setHours(0, 0, 0, 0)
                        const isToday = selectedDate.getTime() === today.getTime()

                        // If no time is set yet, default to current time for today, or 9 AM for future dates
                        if (!scheduledAt) {
                          if (isToday) {
                            datetime.setHours(now.getHours(), now.getMinutes(), 0, 0)
                          } else {
                            datetime.setHours(9, 0, 0, 0)
                          }
                        } else {
                          // Preserve existing time
                          const existingDate = new Date(scheduledAt)
                          datetime.setHours(
                            existingDate.getHours(),
                            existingDate.getMinutes(),
                            0,
                            0
                          )
                        }
                        setValue("scheduledAt", datetime.toISOString())
                      } else {
                        setValue("scheduledAt", null)
                      }
                    }}
                    disabled={(date) => {
                      // Allow today and future dates, only disable past dates
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const compareDate = new Date(date)
                      compareDate.setHours(0, 0, 0, 0)
                      return compareDate < today
                    }}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={timeInputValue}
                      onFocus={(e) => {
                        // When time picker opens, set current time if empty
                        if (!timeInputValue && !scheduledAt) {
                          const now = new Date()
                          const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
                          setTimeInputValue(defaultTime)
                          // Create a datetime with today's date and current time
                          const datetime = new Date()
                          datetime.setHours(now.getHours(), now.getMinutes(), 0, 0)
                          setValue("scheduledAt", datetime.toISOString())
                        }
                      }}
                      onChange={(e) => {
                        const newTime = e.target.value
                        setTimeInputValue(newTime)
                        
                        if (newTime) {
                          const [hours, minutes] = newTime.split(":").map(Number)
                          
                          // Use existing scheduledAt date or default to today
                          const baseDate = scheduledAt ? new Date(scheduledAt) : new Date()
                          const datetime = new Date(baseDate)
                          datetime.setHours(hours, minutes, 0, 0)

                          // If selected date is today, ensure time is not in the past
                          const now = new Date()
                          const selectedDate = new Date(datetime)
                          selectedDate.setHours(0, 0, 0, 0)
                          const today = new Date(now)
                          today.setHours(0, 0, 0, 0)

                          if (selectedDate.getTime() === today.getTime()) {
                            // Compare hours and minutes only, not seconds/milliseconds
                            const selectedTime = hours * 60 + minutes
                            const currentTime = now.getHours() * 60 + now.getMinutes()
                            
                            // Allow selecting current hour (even if minutes have passed)
                            // Only prevent times that are clearly in the past (different hour and in past)
                            const isCurrentHour = hours === now.getHours()
                            const isPastTime = selectedTime < currentTime
                            
                            if (!isCurrentHour && isPastTime) {
                              // Only correct if it's a different hour and in the past
                              datetime.setHours(now.getHours(), now.getMinutes(), 0, 0)
                              // Update the input to show the corrected time
                              const correctedTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
                              setTimeInputValue(correctedTime)
                            }
                          }

                          setValue("scheduledAt", datetime.toISOString())
                        } else if (scheduledAt) {
                          // If time is cleared but date exists, keep the date with default time
                          const baseDate = new Date(scheduledAt)
                          const now = new Date()
                          baseDate.setHours(now.getHours(), now.getMinutes(), 0, 0)
                          setValue("scheduledAt", baseDate.toISOString())
                        }
                      }}
                      min={
                        scheduledAt
                          ? (() => {
                            const selectedDate = new Date(scheduledAt)
                            const today = new Date()
                            selectedDate.setHours(0, 0, 0, 0)
                            today.setHours(0, 0, 0, 0)

                            // If selected date is today, set min time to start of current hour
                            // This allows selecting the current hour even if minutes have passed
                            if (selectedDate.getTime() === today.getTime()) {
                              const now = new Date()
                              return `${String(now.getHours()).padStart(2, "0")}:00`
                            }
                            return undefined
                          })()
                          : undefined
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setValue("scheduledAt", null)
                        setCalendarOpen(false)
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
        )}

        {step === 4 && (
      <Card>
        <CardHeader>
          <CardTitle>Review</CardTitle>
          <CardDescription>
            Review your campaign before creating
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Subject</div>
            <div className="mt-1">{subject || "—"}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Recipients</div>
            <div className="mt-1">{parseEmails(recipientsText || "").length} email(s)</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Schedule</div>
            <div className="mt-1">
              {scheduledAt
                ? new Date(scheduledAt).toLocaleString()
                : "Not scheduled"}
            </div>
          </div>
        </CardContent>
      </Card>
        )}

      <div className="flex justify-between gap-4">
        <div className="flex gap-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          )}
          {step < maxStep ? (
            <Button
              type="button"
              onClick={() => setStep(step + 1)}
            >
              Next
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => sendTestMutation.mutate()}
                disabled={
                  !subject?.trim() ||
                  !body?.trim() ||
                  sendTestMutation.isPending
                }
              >
                {sendTestMutation.isPending ? "Sending..." : "Send test"}
              </Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {isSubmitting || createMutation.isPending
                  ? "Creating..."
                  : "Create Campaign"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
    </>
  )
}
