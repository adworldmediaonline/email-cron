import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendEmail, verifyConnection, formatFromAddress } from "@/lib/services/email-service"

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { to, subject, html } = body

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, html" },
        { status: 400 }
      )
    }

    const verification = await verifyConnection()
    if (!verification.success) {
      return NextResponse.json(
        {
          error: "Resend connection failed",
          details: verification.error,
          message: "Please check RESEND_API_KEY in .env file",
        },
        { status: 500 }
      )
    }

    const senderEmail =
      process.env.RESEND_FROM_EMAIL ||
      process.env.SMTP_FROM_EMAIL ||
      process.env.SMTP_USER ||
      ""
    const senderName =
      process.env.RESEND_FROM_NAME || process.env.SMTP_FROM_NAME || "Email Campaign"

    if (!senderEmail) {
      return NextResponse.json(
        { error: "RESEND_FROM_EMAIL or SMTP_FROM_EMAIL must be configured" },
        { status: 500 }
      )
    }

    const senderResult = await sendEmail({
      to,
      from: formatFromAddress(senderName, senderEmail),
      subject,
      html,
    })

    if (!senderResult.success) {
      return NextResponse.json(
        {
          error: "Failed to send test email",
          details: senderResult.error,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Test email sent successfully",
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      {
        error: "Failed to send test email",
        details: errorMessage,
        message: "Check RESEND_API_KEY and verify your domain in Resend dashboard",
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const verification = await verifyConnection()

    return NextResponse.json({
      success: verification.success,
      error: verification.error,
      config: {
        apiKey: process.env.RESEND_API_KEY ? "***configured***" : "not set",
        fromEmail:
          process.env.RESEND_FROM_EMAIL ||
          process.env.SMTP_FROM_EMAIL ||
          process.env.SMTP_USER ||
          "not set",
        fromName:
          process.env.RESEND_FROM_NAME || process.env.SMTP_FROM_NAME || "not set",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to verify Resend configuration" },
      { status: 500 }
    )
  }
}
