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
      scheduledTimezone: body.scheduledTimezone ?? null,
    })

    // Get default sender from Resend env vars
    const senderEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? ""
    const senderName = process.env.RESEND_FROM_NAME?.trim() ?? "Email Campaign"

    if (!senderEmail) {
      return NextResponse.json(
        { error: "RESEND_FROM_EMAIL must be configured" },
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
        scheduledTimezone: validatedData.scheduledTimezone ?? undefined,
        createdById: session.user.id,
        recipients: {
          create: validatedData.recipients.map((r) => ({
            recipientEmail: r.recipientEmail,
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
