import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getEmailById } from "@/lib/services/email-service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { recipientId } = await params

    const recipient = await prisma.emailRecipient.findFirst({
      where: {
        id: recipientId,
        campaign: {
          createdById: session.user.id,
        },
      },
      include: {
        campaign: {
          select: {
            subject: true,
            id: true,
          },
        },
      },
    })

    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
    }

    if (!recipient.resendEmailId) {
      return NextResponse.json({
        data: {
          recipient: {
            id: recipient.id,
            recipientEmail: recipient.recipientEmail,
            recipientName: recipient.recipientName,
            status: recipient.status,
            sentAt: recipient.sentAt,
            lastEvent: recipient.lastEvent,
            errorMessage: recipient.errorMessage,
          },
          campaign: recipient.campaign,
          resendDetails: null,
          message: "No Resend email ID - email may not have been sent yet",
        },
      })
    }

    const resendResult = await getEmailById(recipient.resendEmailId)

    if (!resendResult.success) {
      return NextResponse.json({
        data: {
          recipient: {
            id: recipient.id,
            recipientEmail: recipient.recipientEmail,
            recipientName: recipient.recipientName,
            status: recipient.status,
            sentAt: recipient.sentAt,
            lastEvent: recipient.lastEvent,
            errorMessage: recipient.errorMessage,
            resendEmailId: recipient.resendEmailId,
          },
          campaign: recipient.campaign,
          resendDetails: null,
          resendError: resendResult.error,
        },
      })
    }

    return NextResponse.json({
      data: {
        recipient: {
          id: recipient.id,
          recipientEmail: recipient.recipientEmail,
          recipientName: recipient.recipientName,
          status: recipient.status,
          sentAt: recipient.sentAt,
          lastEvent: recipient.lastEvent,
          errorMessage: recipient.errorMessage,
          resendEmailId: recipient.resendEmailId,
        },
        campaign: recipient.campaign,
        resendDetails: resendResult.data,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch recipient details" },
      { status: 500 }
    )
  }
}
