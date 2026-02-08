import { z } from "zod"

export const createEmailCampaignSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200, "Subject must be less than 200 characters"),
  body: z.string().min(1, "Email body is required"),
  recipients: z
    .array(
      z.object({
        recipientEmail: z.string().email("Invalid recipient email"),
      })
    )
    .min(1, "At least one recipient is required"),
  scheduledAt: z.date().nullable().optional(),
})

export const updateEmailCampaignSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  status: z.enum(["draft", "scheduled", "sending", "sent", "failed"]).optional(),
  scheduledAt: z.date().nullable().optional(),
})

export const sendEmailSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  recipientIds: z.array(z.string().uuid()).optional(),
})

export const scheduleEmailSchema = z.object({
  campaignId: z.string().uuid("Invalid campaign ID"),
  scheduledAt: z.date().refine((date) => date > new Date(), {
    message: "Scheduled date must be in the future",
  }),
})

export type CreateEmailCampaignInput = z.infer<typeof createEmailCampaignSchema>
export type UpdateEmailCampaignInput = z.infer<typeof updateEmailCampaignSchema>
export type SendEmailInput = z.infer<typeof sendEmailSchema>
export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>
