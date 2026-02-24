import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { EmailCampaignStatus } from "@/lib/types/email"

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

    const existingCampaign = await prisma.emailCampaign.findFirst({
      where: {
        id,
        createdById: session.user.id,
      },
      include: {
        recipients: true,
      },
    })

    if (!existingCampaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const senderEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ""
    const senderName = process.env.SMTP_FROM_NAME || "Email Campaign"

    const duplicated = await prisma.emailCampaign.create({
      data: {
        subject: existingCampaign.subject,
        body: existingCampaign.body,
        senderEmail,
        senderName,
        status: EmailCampaignStatus.DRAFT,
        scheduledAt: null,
        sentAt: null,
        createdById: session.user.id,
        recipients: {
          create: existingCampaign.recipients.map((r) => ({
            recipientEmail: r.recipientEmail,
            recipientName: r.recipientName,
          })),
        },
      },
      include: {
        recipients: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ data: duplicated }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to duplicate campaign" },
      { status: 500 }
    )
  }
}
