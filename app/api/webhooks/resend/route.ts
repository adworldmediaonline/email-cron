import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { prisma } from "@/lib/db"
import { EmailRecipientStatus } from "@/lib/types/email"

const EMAIL_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.failed",
  "email.complained",
  "email.delivery_delayed",
  "email.suppressed",
] as const

type EmailEventType = (typeof EMAIL_EVENTS)[number]

function isEmailEvent(type: string): type is EmailEventType {
  return EMAIL_EVENTS.includes(type as EmailEventType)
}

function eventToLastEvent(type: EmailEventType): string {
  const map: Record<EmailEventType, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.opened": "opened",
    "email.clicked": "clicked",
    "email.bounced": "bounced",
    "email.failed": "failed",
    "email.complained": "complained",
    "email.delivery_delayed": "delivery_delayed",
    "email.suppressed": "suppressed",
  }
  return map[type] ?? type
}

function shouldSetFailedStatus(type: EmailEventType): boolean {
  return type === "email.bounced" || type === "email.failed"
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret?.trim()) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      )
    }

    const payload = await request.text()
    const svixId = request.headers.get("svix-id")
    const svixTimestamp = request.headers.get("svix-timestamp")
    const svixSignature = request.headers.get("svix-signature")

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: "Missing Svix headers" },
        { status: 400 }
      )
    }

    const wh = new Webhook(secret)
    let body: {
      type?: string
      data?: {
        email_id?: string
        bounce?: { message?: string }
        failed?: { reason?: string }
      }
      created_at?: string
    }
    try {
      body = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as typeof body
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const eventType = body?.type
    const emailId = body?.data?.email_id

    if (!eventType || !isEmailEvent(eventType)) {
      return NextResponse.json({ received: true })
    }

    // Idempotency: skip if already processed
    const existing = await prisma.webhookEvent.findUnique({
      where: { svixId },
    })
    if (existing) {
      return NextResponse.json({ received: true })
    }

    await prisma.webhookEvent.create({
      data: {
        svixId,
        type: eventType,
        emailId: emailId ?? null,
        payload: body as object,
      },
    })

    if (!emailId) {
      return NextResponse.json({ received: true })
    }

    const lastEvent = eventToLastEvent(eventType)
    const errorMessage =
      eventType === "email.bounced"
        ? body?.data?.bounce?.message ?? null
        : eventType === "email.failed"
          ? body?.data?.failed?.reason ?? null
          : null

    const updateData: {
      lastEvent: string
      status?: EmailRecipientStatus
      errorMessage?: string | null
    } = {
      lastEvent,
    }
    if (shouldSetFailedStatus(eventType)) {
      updateData.status = EmailRecipientStatus.FAILED
      if (errorMessage) {
        updateData.errorMessage = errorMessage
      }
    }

    await prisma.emailRecipient.updateMany({
      where: { resendEmailId: emailId },
      data: updateData,
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
