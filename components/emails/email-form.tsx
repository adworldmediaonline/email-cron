"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createEmailCampaignSchema } from "@/lib/validations/email-schema"
import type { CreateEmailCampaignInput } from "@/lib/validations/email-schema"
import { TiptapEditor } from "./tiptap-editor"
import { RecipientSelector } from "./recipient-selector"
import { SchedulePicker } from "./schedule-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field } from "@/components/ui/field"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface EmailFormProps {
  onSubmit: (data: CreateEmailCampaignInput) => Promise<void>
  defaultValues?: Partial<CreateEmailCampaignInput>
  isLoading?: boolean
  error?: string | null
}

export function EmailForm({
  onSubmit,
  defaultValues,
  isLoading = false,
  error,
}: EmailFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<CreateEmailCampaignInput>({
    resolver: zodResolver(createEmailCampaignSchema),
    defaultValues: {
      subject: defaultValues?.subject || "",
      body: defaultValues?.body || "",
      recipients: defaultValues?.recipients || [],
      scheduledAt: defaultValues?.scheduledAt || null,
    },
  })

  const body = watch("body")
  const recipients = watch("recipients")
  const scheduledAt = watch("scheduledAt")

  const handleFormSubmit = async (data: CreateEmailCampaignInput) => {
    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive border border-destructive/20">
          <strong>Error:</strong> {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Email Details</CardTitle>
          <CardDescription>Configure your email campaign</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              {...register("subject")}
              placeholder="Email subject line"
              disabled={isLoading}
            />
            {errors.subject && (
              <p className="text-destructive text-sm">{errors.subject.message}</p>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Body</CardTitle>
          <CardDescription>Write your email content</CardDescription>
        </CardHeader>
        <CardContent>
          <TiptapEditor
            content={body || ""}
            onChange={(content) => setValue("body", content, { shouldValidate: true })}
            placeholder="Start writing your email..."
          />
          {errors.body && (
            <p className="text-destructive text-sm mt-2">{errors.body.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>Add email recipients</CardDescription>
        </CardHeader>
        <CardContent>
          <RecipientSelector
            value={recipients || []}
            onChange={(newRecipients) =>
              setValue("recipients", newRecipients, { shouldValidate: true })
            }
            disabled={isLoading}
          />
          {errors.recipients && (
            <p className="text-destructive text-sm mt-2">
              {errors.recipients.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Optionally schedule this email for later</CardDescription>
        </CardHeader>
        <CardContent>
          <SchedulePicker
            value={scheduledAt || null}
            onChange={(date) => setValue("scheduledAt", date, { shouldValidate: true })}
            disabled={isLoading}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Campaign"}
        </Button>
      </div>
    </form>
  )
}
