"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { toast } from "sonner"

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

export function CampaignForm({ defaultValues, onSubmit, onSuccess }: CampaignFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [timeInputValue, setTimeInputValue] = useState<string>("")

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

  // Sync time input value with scheduledAt
  useEffect(() => {
    if (scheduledAt) {
      setTimeInputValue(new Date(scheduledAt).toTimeString().slice(0, 5))
    } else {
      setTimeInputValue("")
    }
  }, [scheduledAt])

  const createMutation = useMutation({
    mutationFn: onSubmit || createCampaign,
    onSuccess: () => {
      // Invalidate campaigns query so it refetches when navigating to the page
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
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Enter email addresses separated by commas or new lines. You can paste multiple emails at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Email Body</CardTitle>
          <CardDescription>
            Write the content for your email campaign
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            Optionally schedule this campaign for later
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
          {isSubmitting || createMutation.isPending
            ? "Creating..."
            : "Create Campaign"}
        </Button>
      </div>
    </form>
  )
}
