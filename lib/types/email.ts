export enum EmailCampaignStatus {
  DRAFT = "draft",
  SCHEDULED = "scheduled",
  SENDING = "sending",
  SENT = "sent",
  FAILED = "failed",
}

export enum EmailRecipientStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
}

export type EmailCampaign = {
  id: string
  subject: string
  body: string
  senderEmail: string
  senderName: string
  status: EmailCampaignStatus
  scheduledAt: Date | null
  sentAt: Date | null
  createdById: string
  createdAt: Date
  updatedAt: Date
  createdBy?: {
    id: string
    name: string
    email: string
  }
  recipients?: EmailRecipient[]
}

export type EmailRecipient = {
  id: string
  campaignId: string
  recipientEmail: string
  recipientName: string | null
  status: EmailRecipientStatus
  sentAt: Date | null
  errorMessage: string | null
  createdAt: Date
}

export type CreateEmailCampaignInput = {
  subject: string
  body: string
  senderEmail: string
  senderName: string
  recipients: {
    recipientEmail: string
    recipientName?: string | null
  }[]
  scheduledAt?: Date | null
}

export type UpdateEmailCampaignInput = {
  subject?: string
  body?: string
  senderEmail?: string
  senderName?: string
  status?: EmailCampaignStatus
  scheduledAt?: Date | null
}

export type SendEmailInput = {
  campaignId: string
  recipientIds?: string[]
}

export type ScheduleEmailInput = {
  campaignId: string
  scheduledAt: Date
}
