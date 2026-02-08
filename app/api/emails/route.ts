import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createEmailCampaignSchema } from "@/lib/validations/email-schema"
import { EmailCampaignStatus } from "@/lib/types/email"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const campaigns = await prisma.emailCampaign.findMany({
      where: {
        createdById: session.user.id,
      },
      include: {
        recipients: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ data: campaigns })
  } catch (error) {
    console.error("Error fetching campaigns:", error)
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Validate input
    const validatedData = createEmailCampaignSchema.parse({
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    })

    // Get default sender from environment variables
    const senderEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ""
    const senderName = process.env.SMTP_FROM_NAME || "Email Campaign"

    if (!senderEmail) {
      return NextResponse.json(
        { error: "SMTP_FROM_EMAIL or SMTP_USER must be configured" },
        { status: 500 }
      )
    }

    // Create campaign with recipients
    const campaign = await prisma.emailCampaign.create({
      data: {
        subject: validatedData.subject,
        body: validatedData.body,
        senderEmail,
        senderName,
        status: validatedData.scheduledAt
          ? EmailCampaignStatus.SCHEDULED
          : EmailCampaignStatus.DRAFT,
        scheduledAt: validatedData.scheduledAt,
        createdById: session.user.id,
        recipients: {
          create: validatedData.recipients.map((r) => ({
            recipientEmail: r.recipientEmail,
            recipientName: r.recipientName || null,
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

    return NextResponse.json({ data: campaign }, { status: 201 })
  } catch (error) {
    console.error("Error creating campaign:", error)
    
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "issues" in error) {
      const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> }
      const errorMessages = zodError.issues.map((issue) => {
        const path = issue.path.map(String).join(".")
        return `${path}: ${issue.message}`
      })
      return NextResponse.json(
        { error: "Validation error", details: errorMessages.join(", ") },
        { status: 400 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : "Failed to create campaign"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
