import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { personalizeContent } from "@/lib/utils/personalization"
import { sendBulkEmails, getDefaultFrom } from "@/lib/services/email-service"
import { EmailCampaignStatus, EmailRecipientStatus } from "@/lib/types/email"

function getFromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim()
  if (!email) {
    throw new Error(
      "RESEND_FROM_EMAIL must be set in .env. Restart the dev server (pnpm dev) after changing .env."
    )
  }
  return getDefaultFrom()
}

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
      from: getFromAddress(),
      replyTo: undefined,
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
            resendEmailId: result.resendEmailId ?? undefined,
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

    // When all sends failed, return 500 with the actual error so user sees Resend error (e.g. domain not verified)
    if (failedCount > 0 && successCount === 0) {
      const firstError = emailResults.find((r) => r.error)?.error ?? "All emails failed to send"
      return NextResponse.json(
        { error: firstError, sent: 0, failed: failedCount },
        { status: 500 }
      )
    }

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
