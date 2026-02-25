import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { personalizeContent } from "@/lib/utils/personalization"
import { sendBulkEmails, formatFromAddress } from "@/lib/services/email-service"
import { EmailCampaignStatus, EmailRecipientStatus } from "@/lib/types/email"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const campaign = await prisma.emailCampaign.findFirst({
      where: {
        id,
        createdById: session.user.id,
      },
      include: {
        recipients: {
          where: {
            status: EmailRecipientStatus.PENDING,
          },
        },
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    if (campaign.recipients.length === 0) {
      return NextResponse.json(
        { error: "No pending recipients found" },
        { status: 400 }
      )
    }

    // Update campaign status
    await prisma.emailCampaign.update({
      where: { id },
      data: { status: EmailCampaignStatus.SENDING },
    })

    // Prepare emails for bulk sending (with personalization)
    const emails = campaign.recipients.map((recipient) => ({
      to: recipient.recipientEmail,
      subject: personalizeContent(campaign.subject, recipient),
      html: personalizeContent(campaign.body, recipient),
    }))

    // Send emails in batches with rate limiting
    const emailResults = await sendBulkEmails(emails, {
      batchSize: 10,
      delayBetweenBatches: 1000,
      from: formatFromAddress(campaign.senderName, campaign.senderEmail),
      replyTo: process.env.RESEND_REPLY_TO || process.env.SMTP_REPLY_TO || campaign.senderEmail,
      idempotencyKeyPrefix: campaign.id,
    })

    // Update recipient statuses
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
      } else {
        await prisma.emailRecipient.update({
          where: { id: recipient.id },
          data: {
            status: EmailRecipientStatus.FAILED,
            errorMessage: result?.error || "Unknown error",
          },
        })
        failedCount++
      }
    }

    // Update campaign status
    const finalStatus =
      failedCount === 0 ? EmailCampaignStatus.SENT : successCount > 0 ? EmailCampaignStatus.SENT : EmailCampaignStatus.FAILED

    await prisma.emailCampaign.update({
      where: { id },
      data: {
        status: finalStatus,
        sentAt: finalStatus === EmailCampaignStatus.SENT ? new Date() : undefined,
      },
    })

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failedCount,
    })
  } catch (error) {
    // Update campaign status to failed
    try {
      const { id } = await params
      await prisma.emailCampaign.update({
        where: { id },
        data: { status: EmailCampaignStatus.FAILED },
      })
    } catch (updateError) {
      // Silently handle update error
    }

    return NextResponse.json(
      { error: "Failed to send campaign" },
      { status: 500 }
    )
  }
}
