import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendEmail } from "@/lib/services/email-service"

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { subject, body: htmlBody } = body as { subject?: string; body?: string }

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      )
    }

    if (!htmlBody || typeof htmlBody !== "string") {
      return NextResponse.json(
        { error: "Body is required" },
        { status: 400 }
      )
    }

    const result = await sendEmail({
      to: session.user.email,
      subject: `[Test] ${subject.trim()}`,
      html: htmlBody,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send test email" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: "Test email sent to " + session.user.email,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 }
    )
  }
}
