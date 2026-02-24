import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { scheduleEmailSchema } from "@/lib/validations/email-schema"
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
    const body = await request.json()

    // Validate input
    const validatedData = scheduleEmailSchema.parse({
      campaignId: id,
      scheduledAt: new Date(body.scheduledAt),
      scheduledTimezone: body.scheduledTimezone ?? null,
    })

    // Get campaign
    const campaign = await prisma.emailCampaign.findFirst({
      where: {
        id: validatedData.campaignId,
        createdById: session.user.id,
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    // Update campaign with scheduled date
    const updatedCampaign = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        scheduledAt: validatedData.scheduledAt,
        scheduledTimezone: validatedData.scheduledTimezone ?? undefined,
        status: EmailCampaignStatus.SCHEDULED,
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

    return NextResponse.json({
      message: "Email scheduled successfully",
      data: updatedCampaign,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to schedule email" },
      { status: 500 }
    )
  }
}
