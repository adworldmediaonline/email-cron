import { prisma } from "@/lib/db"
import { EmailCampaignStatus, EmailRecipientStatus } from "@/lib/types/email"
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

  console.log(`[Cron] Starting scheduled email processing at ${now.toISOString()}`)

  // Find campaigns that are scheduled and ready to send
  // Limit to prevent overload
  const MAX_CAMPAIGNS_PER_RUN = 50
  
  // Debug: Check what campaigns exist (always run debug to see what's in DB)
  let scheduledCampaignsDebug: Array<{ id: string; status: string; scheduledAt: Date | null; subject: string }> = []
  try {
    const allCampaigns = await prisma.emailCampaign.findMany({
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        subject: true,
      },
      take: 10,
    })
    console.log(`[Cron] 🔍 Debug: Found ${allCampaigns.length} total campaigns in database (showing first 10):`)
    if (allCampaigns.length > 0) {
      allCampaigns.forEach((c) => {
        console.log(`[Cron]   - Campaign ${c.id}: status="${c.status}", scheduledAt=${c.scheduledAt?.toISOString() || "null"}, subject="${c.subject.substring(0, 30)}..."`)
      })
    } else {
      console.log(`[Cron]   - No campaigns found in database`)
    }
    
    // Debug: Check scheduled campaigns specifically
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
    })
    console.log(`[Cron] 🔍 Debug: Found ${scheduledCampaignsDebug.length} campaigns with SCHEDULED status`)
    if (scheduledCampaignsDebug.length > 0) {
      scheduledCampaignsDebug.forEach((c) => {
        const isReady = c.scheduledAt && c.scheduledAt <= now
        console.log(`[Cron]   - Campaign ${c.id}: scheduledAt=${c.scheduledAt?.toISOString() || "null"}, ready=${isReady}, subject="${c.subject.substring(0, 30)}..."`)
      })
    }
  } catch (debugError) {
    // Retry once on connection errors (common with Prisma Accelerate)
    if (debugError instanceof Error && debugError.message.includes("fetch failed")) {
      console.log(`[Cron] ⚠️  Initial connection failed, retrying...`)
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
        const retryCampaigns = await prisma.emailCampaign.findMany({
          where: { status: EmailCampaignStatus.SCHEDULED },
          select: { id: true, status: true, scheduledAt: true, subject: true },
        })
        scheduledCampaignsDebug = retryCampaigns
        console.log(`[Cron] 🔍 Debug (retry): Found ${scheduledCampaignsDebug.length} campaigns with SCHEDULED status`)
      } catch (retryError) {
        console.error(`[Cron] ❌ Retry also failed:`, retryError)
      }
    } else {
      console.error(`[Cron] ❌ Debug query failed:`, debugError)
    }
  }
  
  const campaigns = (await prisma.emailCampaign.findMany({
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

  if (campaigns.length === 0) {
    // Only log debug info if there are scheduled campaigns but none are ready
    // This reduces log noise when there are no campaigns at all
    if (scheduledCampaignsDebug.length > 0) {
      console.log(`[Cron] Found ${scheduledCampaignsDebug.length} scheduled campaign(s), but none are ready yet (checked at ${now.toISOString()})`)
    }
    // Don't log every minute if there are no campaigns - too noisy
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [],
    }
  }

  console.log(`[Cron] Found ${campaigns.length} scheduled campaign(s) to process`)

  let processed = 0
  let totalSent = 0
  let totalFailed = 0

  for (const campaign of campaigns) {
    try {
      // Update campaign status to sending
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: EmailCampaignStatus.SENDING },
      })

      if (campaign.recipients.length === 0) {
        // No recipients, mark as sent
        await prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            status: EmailCampaignStatus.SENT,
            sentAt: new Date(),
          },
        })
        processed++
        continue
      }

      console.log(`[Cron] Sending campaign ${campaign.id} to ${campaign.recipients.length} recipient(s)`)

      // Prepare emails for bulk sending (simpler format like working project)
      const emails = campaign.recipients.map((recipient) => ({
        to: recipient.recipientEmail,
        subject: campaign.subject,
        html: campaign.body,
      }))

      // Send emails in batches with rate limiting
      const emailResults = await sendBulkEmails(emails, {
        batchSize: 10, // Send 10 emails per batch
        delayBetweenBatches: 1000, // 1 second delay between batches
      })

      // Update recipient statuses based on results
      let successCount = 0
      let failedCount = 0

      for (let i = 0; i < campaign.recipients.length; i++) {
        const recipient = campaign.recipients[i]
        const result = emailResults[i]

        if (result?.success) {
          await prisma.emailRecipient.update({
            where: { id: recipient.id },
            data: {
              status: EmailRecipientStatus.SENT,
              sentAt: new Date(),
            },
          })
          successCount++
          totalSent++
        } else {
          await prisma.emailRecipient.update({
            where: { id: recipient.id },
            data: {
              status: EmailRecipientStatus.FAILED,
              errorMessage: result?.error || "Unknown error",
            },
          })
          failedCount++
          totalFailed++
        }
      }

      console.log(`[Cron] Campaign ${campaign.id} completed: ${successCount} sent, ${failedCount} failed`)

      // Update campaign status based on results
      const finalStatus =
        failedCount === 0
          ? EmailCampaignStatus.SENT
          : successCount > 0
            ? EmailCampaignStatus.SENT
            : EmailCampaignStatus.FAILED

      await prisma.emailCampaign.update({
        where: { id: campaign.id },
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

      // Mark campaign as failed
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: EmailCampaignStatus.FAILED },
      })

      processed++
    }
  }

  const duration = Date.now() - startTime
  console.log(
    `[Cron] Completed: ${processed} campaign(s) processed, ${totalSent} sent, ${totalFailed} failed in ${duration}ms`
  )

  return {
    processed,
    sent: totalSent,
    failed: totalFailed,
    errors,
  }
}
