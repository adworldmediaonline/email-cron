import { prisma } from "@/lib/db"
import { EmailCampaignStatus, EmailRecipientStatus } from "@/lib/types/email"
import { personalizeContent } from "@/lib/utils/personalization"
import { sendBulkEmails } from "./email-service"

export async function processScheduledEmails(): Promise<{
  processed: number
  sent: number
  failed: number
  errors: string[]
}> {
  const startTime = Date.now()
  const now = new Date()
  const errors: string[] = []

  // Find campaigns that are scheduled and ready to send
  // Limit to prevent overload
  const MAX_CAMPAIGNS_PER_RUN = 50
  
  // Debug: Only run debug queries in development or when explicitly enabled
  // This reduces load on Prisma Accelerate in production
  const ENABLE_DEBUG = process.env.NODE_ENV === "development" || process.env.ENABLE_CRON_DEBUG === "true"
  let scheduledCampaignsDebug: Array<{ id: string; status: string; scheduledAt: Date | null; subject: string }> = []
  
  if (ENABLE_DEBUG) {
    try {
      // Lightweight debug query - only count scheduled campaigns
      scheduledCampaignsDebug = await prisma.emailCampaign.findMany({
        where: {
          status: EmailCampaignStatus.SCHEDULED,
        },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          subject: true,
        },
        take: 5, // Limit to 5 for debug
      })
    } catch (debugError) {
      // Silently skip debug queries if they fail (common with Prisma Accelerate limits)
    }
  }
  
  // Main query - find campaigns ready to send
  let campaigns: Array<{
    id: string
    status: EmailCampaignStatus
    scheduledAt: Date | null
    subject: string
    body: string
    recipients: Array<{
      id: string
      recipientEmail: string
      recipientName: string | null
      status: EmailRecipientStatus
    }>
  }> = []
  
  try {
    campaigns = (await prisma.emailCampaign.findMany({
      where: {
        status: EmailCampaignStatus.SCHEDULED,
        scheduledAt: {
          lte: now,
        },
      },
      include: {
        recipients: {
          where: {
            status: EmailRecipientStatus.PENDING,
          },
        },
      },
      take: MAX_CAMPAIGNS_PER_RUN,
      orderBy: {
        scheduledAt: "asc", // Process oldest first
      },
    })) as unknown as Array<{
      id: string
      status: EmailCampaignStatus
      scheduledAt: Date | null
      subject: string
      body: string
      recipients: Array<{
        id: string
        recipientEmail: string
        recipientName: string | null
        status: EmailRecipientStatus
      }>
    }>
  } catch (queryError) {
    // Handle Prisma Accelerate resource limit errors gracefully
    if (queryError instanceof Error && queryError.message.includes("Worker exceeded resource limits")) {
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        errors: ["Prisma Accelerate resource limit exceeded"],
      }
    }
    // Re-throw other errors
    throw queryError
  }

  if (campaigns.length === 0) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [],
    }
  }

  let processed = 0
  let totalSent = 0
  let totalFailed = 0

  for (const campaign of campaigns) {
    try {
      // Atomic update: Only update if status is still SCHEDULED (prevents race conditions)
      // This ensures idempotency - if two cron jobs run concurrently, only one will succeed
      const updatedCampaign = await prisma.emailCampaign.updateMany({
        where: {
          id: campaign.id,
          status: EmailCampaignStatus.SCHEDULED, // Only update if still scheduled
        },
        data: { status: EmailCampaignStatus.SENDING },
      })

      // If update affected 0 rows, another process already claimed this campaign
      if (updatedCampaign.count === 0) {
        continue
      }

      if (campaign.recipients.length === 0) {
        // No recipients, mark as sent (idempotent - safe to run multiple times)
        await prisma.emailCampaign.updateMany({
          where: {
            id: campaign.id,
            status: EmailCampaignStatus.SENDING, // Only update if still sending
          },
          data: {
            status: EmailCampaignStatus.SENT,
            sentAt: new Date(),
          },
        })
        processed++
        continue
      }

      // Re-fetch campaign to ensure we have latest data (defensive programming)
      // This helps prevent issues if the campaign was modified between query and processing
      const currentCampaign = await prisma.emailCampaign.findUnique({
        where: { id: campaign.id },
        include: {
          recipients: {
            where: {
              status: EmailRecipientStatus.PENDING,
            },
          },
        },
      })

      // Double-check campaign is still in SENDING status (another process might have completed it)
      if (!currentCampaign || currentCampaign.status !== EmailCampaignStatus.SENDING) {
        continue
      }

      // Use current campaign data (may have fewer recipients if some were already processed)
      const recipientsToProcess = currentCampaign.recipients

      // Prepare emails for bulk sending (with personalization)
      const emails = recipientsToProcess.map((recipient) => ({
        to: recipient.recipientEmail,
        subject: personalizeContent(currentCampaign.subject, recipient),
        html: personalizeContent(currentCampaign.body, recipient),
      }))

      // Send emails in batches with rate limiting
      const emailResults = await sendBulkEmails(emails, {
        batchSize: 10, // Send 10 emails per batch
        delayBetweenBatches: 1000, // 1 second delay between batches
      })

      // Update recipient statuses based on results
      // Use atomic updates to prevent duplicate processing (idempotency)
      let successCount = 0
      let failedCount = 0

      for (let i = 0; i < recipientsToProcess.length; i++) {
        const recipient = recipientsToProcess[i]
        const result = emailResults[i]

        if (result?.success) {
          // Atomic update: Only update if still PENDING (prevents duplicate sends)
          const updateResult = await prisma.emailRecipient.updateMany({
            where: {
              id: recipient.id,
              status: EmailRecipientStatus.PENDING, // Only update if still pending
            },
            data: {
              status: EmailRecipientStatus.SENT,
              sentAt: new Date(),
            },
          })
          if (updateResult.count > 0) {
            successCount++
            totalSent++
          }
        } else {
          // Update failed status (idempotent - safe to run multiple times)
          await prisma.emailRecipient.updateMany({
            where: {
              id: recipient.id,
              status: EmailRecipientStatus.PENDING,
            },
            data: {
              status: EmailRecipientStatus.FAILED,
              errorMessage: result?.error || "Unknown error",
            },
          })
          failedCount++
          totalFailed++
        }
      }

      // Update campaign status based on results
      // Atomic update: Only update if still SENDING (prevents race conditions)
      const finalStatus =
        failedCount === 0
          ? EmailCampaignStatus.SENT
          : successCount > 0
            ? EmailCampaignStatus.SENT
            : EmailCampaignStatus.FAILED

      await prisma.emailCampaign.updateMany({
        where: {
          id: campaign.id,
          status: EmailCampaignStatus.SENDING, // Only update if still sending
        },
        data: {
          status: finalStatus,
          sentAt: finalStatus === EmailCampaignStatus.SENT ? new Date() : undefined,
        },
      })

      processed++

      // Small delay between campaigns to prevent overload
      if (campaigns.indexOf(campaign) < campaigns.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      errors.push(`Campaign ${campaign.id}: ${errorMessage}`)

      // Mark campaign as failed (idempotent - safe to run multiple times)
      // Only update if still in SENDING or SCHEDULED status
      await prisma.emailCampaign.updateMany({
        where: {
          id: campaign.id,
          status: {
            in: [EmailCampaignStatus.SENDING, EmailCampaignStatus.SCHEDULED],
          },
        },
        data: { status: EmailCampaignStatus.FAILED },
      })

      processed++
    }
  }

  return {
    processed,
    sent: totalSent,
    failed: totalFailed,
    errors,
  }
}
