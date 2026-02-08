"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { X, Plus } from "lucide-react"

const recipientSchema = z.object({
  recipientEmail: z.string().email("Invalid email address"),
  recipientName: z.string().optional(),
})

const campaignSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  scheduledAt: z.string().datetime().optional().nullable(),
  recipients: z.array(recipientSchema).min(1, "At least one recipient is required"),
})

type CampaignFormData = z.infer<typeof campaignSchema>

async function createCampaign(data: CampaignFormData) {
  const response = await fetch("/api/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to create campaign")
  }

  return response.json()
}

interface CampaignFormProps {
  defaultValues?: Partial<CampaignFormData>
  onSubmit?: (data: CampaignFormData) => Promise<void>
  onSuccess?: () => void
}

export function CampaignForm({ defaultValues, onSubmit, onSuccess }: CampaignFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [calendarOpen, setCalendarOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema as any),
    defaultValues: {
      subject: defaultValues?.subject || "",
      body: defaultValues?.body || "",
      scheduledAt: defaultValues?.scheduledAt ? new Date(defaultValues.scheduledAt).toISOString() : null,
      recipients: defaultValues?.recipients || [{ recipientEmail: "", recipientName: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "recipients",
  })

  const body = watch("body")
  const scheduledAt = watch("scheduledAt")

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
            Enter the subject and content for your email campaign
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

          <div className="space-y-2">
            <Label htmlFor="body">Email Body</Label>
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
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Add email addresses to send this campaign to
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`recipients.${index}.recipientEmail`}>
                  Email {index + 1}
                </Label>
                <Input
                  id={`recipients.${index}.recipientEmail`}
                  type="email"
                  placeholder="recipient@example.com"
                  {...register(`recipients.${index}.recipientEmail`)}
                  aria-invalid={
                    errors.recipients?.[index]?.recipientEmail ? "true" : "false"
                  }
                />
                {errors.recipients?.[index]?.recipientEmail && (
                  <p className="text-sm text-destructive">
                    {errors.recipients[index]?.recipientEmail?.message}
                  </p>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`recipients.${index}.recipientName`}>
                  Name (Optional)
                </Label>
                <Input
                  id={`recipients.${index}.recipientName`}
                  placeholder="John Doe"
                  {...register(`recipients.${index}.recipientName`)}
                />
              </div>
              {fields.length > 1 && (
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {errors.recipients && errors.recipients.root && (
            <p className="text-sm text-destructive">
              {errors.recipients.root.message}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ recipientEmail: "", recipientName: "" })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Recipient
          </Button>
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
                        // If no time is set yet, default to 9 AM, otherwise preserve existing time
                        if (!scheduledAt) {
                          datetime.setHours(9, 0, 0, 0)
                        } else {
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
                      value={
                        scheduledAt
                          ? new Date(scheduledAt).toTimeString().slice(0, 5)
                          : ""
                      }
                      onChange={(e) => {
                        if (scheduledAt && e.target.value) {
                          const [hours, minutes] = e.target.value.split(":")
                          const datetime = new Date(scheduledAt)
                          datetime.setHours(parseInt(hours), parseInt(minutes), 0, 0)
                          
                          // If selected date is today, ensure time is in the future
                          const now = new Date()
                          const selectedDate = new Date(scheduledAt)
                          selectedDate.setHours(0, 0, 0, 0)
                          const today = new Date(now)
                          today.setHours(0, 0, 0, 0)
                          
                          if (selectedDate.getTime() === today.getTime() && datetime <= now) {
                            // If time is in the past for today, set to current time + 1 hour
                            datetime.setHours(now.getHours() + 1, now.getMinutes(), 0, 0)
                          }
                          
                          setValue("scheduledAt", datetime.toISOString())
                        }
                      }}
                      min={
                        scheduledAt
                          ? (() => {
                              const selectedDate = new Date(scheduledAt)
                              const today = new Date()
                              selectedDate.setHours(0, 0, 0, 0)
                              today.setHours(0, 0, 0, 0)
                              
                              // If selected date is today, set min time to current time
                              if (selectedDate.getTime() === today.getTime()) {
                                const now = new Date()
                                return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
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
