"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DateTime } from "luxon"
import {
  getCommonTimezones,
  getBrowserTimezone,
  toUtcFromZoned,
  getZonedDateParts,
  resolveTimezoneForApi,
  formatInTimezone,
} from "@/lib/utils/timezone"
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
import { TimePicker } from "@/components/ui/time-picker"
import { cn } from "@/lib/utils"
import { AlertCircle, FilterX, Upload } from "lucide-react"
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
// Rejects invalid chars (e.g. { } | \ < > [ ] * ) common in typos, placeholders, or masks
function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false
  if (/[{}|\\<>[\]\s,*]/.test(email)) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function stripHtmlContent(html: string): string {
  if (!html?.trim()) return ""
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .trim()
}

function suggestSubjectFromBody(body: string): string {
  const stripped = stripHtmlContent(body)
  if (!stripped) return ""
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

const campaignSchema = z
  .object({
    subject: z.string().min(1, "Enter a subject line for your email"),
    body: z.string().min(1, "Add email content before continuing"),
    scheduledAt: z.string().datetime().optional().nullable(),
    scheduledTimezone: z.string().optional().nullable(),
    recipientsText: z
      .string()
      .min(1, "Add at least one recipient")
      .refine(
        (text) => {
          const emails = parseEmails(text)
          return emails.length > 0
        },
        { message: "Add at least one recipient" }
      )
      .refine(
        (text) => {
          const emails = parseEmails(text)
          return emails.every((email) => isValidEmail(email))
        },
        {
          message:
            "Some emails are invalid. Check the format (e.g. name@domain.com)",
        }
      ),
  })
  .refine(
    (data) => {
      const stripped = stripHtmlContent(data.body)
      return stripped.length > 0
    },
    { message: "Add email content before continuing", path: ["body"] }
  )

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
      scheduledTimezone: resolveTimezoneForApi(data.scheduledTimezone) ?? undefined,
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
    scheduledTimezone?: string | null
    recipientsText?: string
    recipients?: Array<{ recipientEmail: string }>
  }
  onSubmit?: (data: CampaignFormData) => Promise<void>
  onSuccess?: () => void
}

function getSchedulePresetDatetime(
  preset: "now" | "1h" | "tomorrow" | "next-monday",
  timezone: string
): Date {
  const zone = timezone === "local" ? getBrowserTimezone() : timezone
  const now = DateTime.now().setZone(zone)

  switch (preset) {
    case "now":
      return now.toUTC().toJSDate()
    case "1h":
      return now.plus({ hours: 1 }).toUTC().toJSDate()
    case "tomorrow": {
      const tomorrow = now.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0 })
      return tomorrow.toUTC().toJSDate()
    }
    case "next-monday": {
      const monday = now.plus({ days: (8 - now.weekday) % 7 || 7 }).set({
        hour: 9,
        minute: 0,
        second: 0,
      })
      return monday.toUTC().toJSDate()
    }
    default:
      return now.toUTC().toJSDate()
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
    trigger,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema as any),
    defaultValues: {
      subject: defaultValues?.subject || "",
      body: defaultValues?.body || "",
      scheduledAt: defaultValues?.scheduledAt ? new Date(defaultValues.scheduledAt).toISOString() : null,
      scheduledTimezone: defaultValues?.scheduledTimezone ?? "local",
      recipientsText: defaultValues?.recipientsText
        ? defaultValues.recipientsText
        : defaultValues?.recipients
          ? defaultValues.recipients.map(r => r.recipientEmail).join("\n")
          : "",
    },
  })

  const body = watch("body")
  const scheduledAt = watch("scheduledAt")
  const scheduledTimezone = watch("scheduledTimezone") ?? "local"
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
      if (draft.scheduledTimezone) setValue("scheduledTimezone", draft.scheduledTimezone)
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
        scheduledTimezone: scheduledTimezone || null,
      }))
    }, DRAFT_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [subject, body, recipientsText, scheduledAt, scheduledTimezone])

  // Sync time input value with scheduledAt (in selected timezone)
  useEffect(() => {
    if (scheduledAt) {
      const parts = getZonedDateParts(new Date(scheduledAt), scheduledTimezone)
      setTimeInputValue(
        `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
      )
    } else {
      setTimeInputValue("")
    }
  }, [scheduledAt, scheduledTimezone])

  // Clear selected list when recipients are cleared
  useEffect(() => {
    if (!recipientsText || parseEmails(recipientsText).length === 0) {
      setSelectedListId("")
    }
  }, [recipientsText])

  const applySchedulePreset = useCallback(
    (preset: "now" | "1h" | "tomorrow" | "next-monday") => {
      const datetime = getSchedulePresetDatetime(preset, scheduledTimezone)
      setValue("scheduledAt", datetime.toISOString())
      setCalendarOpen(false)
    },
    [setValue, scheduledTimezone]
  )

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

  const handleClearInvalidEmails = () => {
    const emails = parseEmails(recipientsText || "")
    const valid = emails.filter((e) => isValidEmail(e))
    const invalidCount = emails.length - valid.length
    if (invalidCount > 0) {
      setValue("recipientsText", valid.join("\n"))
      toast.success(`Removed ${invalidCount} invalid email(s)`)
    } else {
      toast.info("No invalid emails found")
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

  const STEP_FIELDS: Record<number, (keyof CampaignFormData)[]> = {
    0: ["subject"],
    1: ["recipientsText"],
    2: ["body"],
    3: [],
    4: ["subject", "recipientsText", "body"],
  }

  const stepHasError = (stepIndex: number): boolean => {
    const fields = STEP_FIELDS[stepIndex]
    return fields.some((f) => errors[f])
  }

  const handleNextStep = async () => {
    const fields = STEP_FIELDS[step]
    const valid = fields.length === 0 ? true : await trigger(fields)
    if (valid) {
      setStep(step + 1)
    } else if (fields[0]) {
      setFocus(fields[0])
    }
  }

  const reviewStepErrors = [
    errors.subject && { step: 0, label: "Details", message: errors.subject.message },
    errors.recipientsText && {
      step: 1,
      label: "Recipients",
      message: errors.recipientsText.message,
    },
    errors.body && { step: 2, label: "Body", message: errors.body.message },
  ].filter(Boolean) as Array<{ step: number; label: string; message: string }>

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
        <div className="flex items-center gap-2 overflow-x-auto p-2 -mx-1 min-h-10">
          {STEPS.map((label, i) => {
            const hasError = stepHasError(i)
            return (
              <div key={label} className="flex items-center gap-2 shrink-0 py-0.5">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium transition-colors flex items-center gap-1.5",
                    hasError && "border-2 border-destructive",
                    step === i
                      ? hasError
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : "bg-primary text-primary-foreground"
                      : hasError
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : i < step
                          ? "bg-muted text-muted-foreground hover:bg-muted/80"
                          : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {hasError && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                  {i + 1}. {label}
                </button>
                {i < maxStep && <span className="text-muted-foreground">›</span>}
              </div>
            )
          })}
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
              className={cn(
                errors.subject && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {errors.subject && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errors.subject.message}
              </p>
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
            <div className="flex flex-wrap gap-2">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearInvalidEmails}
                disabled={
                  !recipientsText ||
                  parseEmails(recipientsText || "").filter((e) => !isValidEmail(e))
                    .length === 0
                }
              >
                <FilterX className="mr-2 h-4 w-4" />
                Clear invalid emails
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
              className={cn(
                "font-mono text-sm",
                errors.recipientsText && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {errors.recipientsText && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errors.recipientsText.message}
              </p>
            )}
            {(() => {
              const emails = parseEmails(recipientsText || "")
              const invalid = emails.filter((e) => !isValidEmail(e))
              if (emails.length > 0) {
                return (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Parsed emails ({emails.length - invalid.length} valid, {invalid.length} invalid)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {emails.map((e, i) => (
                        <span
                          key={`${e}-${i}`}
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono",
                            isValidEmail(e)
                              ? "bg-muted text-muted-foreground"
                              : "bg-destructive/10 text-destructive border border-destructive/30"
                          )}
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                    {invalid.length > 0 && (
                      <p className="text-sm text-destructive flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {invalid.length} invalid email(s). Use &quot;Clear invalid emails&quot; to remove them.
                      </p>
                    )}
                  </div>
                )
              }
              return (
                <p className="text-xs text-muted-foreground">
                  Tip: Paste emails separated by commas, spaces, or new lines.
                </p>
              )
            })()}
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
            <div
              className={cn(
                "rounded-md border",
                errors.body && "border-destructive ring-2 ring-destructive/20"
              )}
            >
              <TiptapEditor
                content={body}
                onChange={(content) => setValue("body", content)}
                placeholder="Write your email content here..."
              />
            </div>
            {errors.body && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errors.body.message}
              </p>
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
            <Label>Timezone</Label>
            <Select
              value={scheduledTimezone}
              onValueChange={(v) => {
                setValue("scheduledTimezone", v)
                // Auto-adjust date/time to current moment in the selected timezone
                const nowInZone = getSchedulePresetDatetime("now", v)
                setValue("scheduledAt", nowInZone.toISOString())
              }}
            >
              <SelectTrigger className="w-full max-w-[320px]">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {getCommonTimezones().map((group) => (
                  <div key={group.group}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.group}
                    </div>
                    {group.zones.map((z) => (
                      <SelectItem key={z.value} value={z.value}>
                        {z.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                    ? formatInTimezone(scheduledAt, scheduledTimezone)
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
                    selected={
                      scheduledAt
                        ? (() => {
                            const parts = getZonedDateParts(
                              new Date(scheduledAt),
                              scheduledTimezone
                            )
                            return new Date(parts.year, parts.month - 1, parts.day)
                          })()
                        : undefined
                    }
                    onSelect={(date) => {
                      if (date) {
                        const [hours, minutes] = timeInputValue
                          ? timeInputValue.split(":").map(Number)
                          : [9, 0]
                        const datetime = new Date(
                          date.getFullYear(),
                          date.getMonth(),
                          date.getDate(),
                          hours,
                          minutes,
                          0
                        )
                        const utc = toUtcFromZoned(datetime, scheduledTimezone)
                        setValue("scheduledAt", utc.toISOString())
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
                    <TimePicker
                      value={timeInputValue}
                      placeholder="Select time"
                      onChange={(newTime) => {
                        setTimeInputValue(newTime)

                        if (newTime) {
                          const [hours, minutes] = newTime.split(":").map(Number)
                          const zone =
                            scheduledTimezone === "local"
                              ? getBrowserTimezone()
                              : scheduledTimezone

                          let year: number
                          let month: number
                          let day: number
                          if (scheduledAt) {
                            const parts = getZonedDateParts(
                              new Date(scheduledAt),
                              scheduledTimezone
                            )
                            ;({ year, month, day } = parts)
                          } else {
                            const now = DateTime.now().setZone(zone)
                            year = now.year
                            month = now.month
                            day = now.day
                          }

                          const datetime = new Date(year, month - 1, day, hours, minutes, 0)
                          let utc = toUtcFromZoned(datetime, scheduledTimezone)

                          if (utc.getTime() < Date.now()) {
                            utc = new Date()
                            const nowParts = getZonedDateParts(utc, scheduledTimezone)
                            setTimeInputValue(
                              `${String(nowParts.hour).padStart(2, "0")}:${String(nowParts.minute).padStart(2, "0")}`
                            )
                          }

                          setValue("scheduledAt", utc.toISOString())
                        } else if (scheduledAt) {
                          const parts = getZonedDateParts(
                            new Date(scheduledAt),
                            scheduledTimezone
                          )
                          const now = DateTime.now().setZone(
                            scheduledTimezone === "local"
                              ? getBrowserTimezone()
                              : scheduledTimezone
                          )
                          const datetime = new Date(
                            parts.year,
                            parts.month - 1,
                            parts.day,
                            now.hour,
                            now.minute,
                            0
                          )
                          setValue(
                            "scheduledAt",
                            toUtcFromZoned(datetime, scheduledTimezone).toISOString()
                          )
                          setTimeInputValue(
                            `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`
                          )
                        }
                      }}
                      onOpenChange={(open) => {
                        if (open && !timeInputValue && !scheduledAt) {
                          const zone =
                            scheduledTimezone === "local"
                              ? getBrowserTimezone()
                              : scheduledTimezone
                          const now = DateTime.now().setZone(zone)
                          const defaultTime = `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`
                          setTimeInputValue(defaultTime)
                          const datetime = new Date(
                            now.year,
                            now.month - 1,
                            now.day,
                            now.hour,
                            now.minute,
                            0
                          )
                          setValue(
                            "scheduledAt",
                            toUtcFromZoned(datetime, scheduledTimezone).toISOString()
                          )
                        }
                      }}
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
          {reviewStepErrors.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3"
            >
              <p className="text-sm font-medium text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Fix these issues before creating your campaign
              </p>
              <ul className="space-y-2">
                {reviewStepErrors.map(({ step: stepIdx, label, message }) => (
                  <li key={stepIdx} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-destructive">{message}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setStep(stepIdx)}
                    >
                      Go to {label}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                ? formatInTimezone(scheduledAt, scheduledTimezone)
                : "Not scheduled"}
            </div>
          </div>
        </CardContent>
      </Card>
        )}

      <div className="sticky bottom-0 flex justify-between gap-4 bg-background pt-4 pb-2 -mx-1 px-1 border-t mt-6">
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
            <Button type="button" onClick={handleNextStep}>
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
