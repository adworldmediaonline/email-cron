import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendEmail, verifyConnection } from "@/lib/services/email-service"

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

    // Verify SMTP connection first
    const verification = await verifyConnection()
    if (!verification.success) {
      return NextResponse.json(
        { 
          error: "SMTP connection failed", 
          details: verification.error,
          message: "Please check your SMTP configuration in .env file"
        },
        { status: 500 }
      )
    }

    // Get default sender from environment variables
    const senderEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ""
    const senderName = process.env.SMTP_FROM_NAME || "Email Campaign"

    if (!senderEmail) {
      return NextResponse.json(
        { error: "SMTP_FROM_EMAIL or SMTP_USER must be configured" },
        { status: 500 }
      )
    }

    // Send test email
    // Format from address with name if provided
    const fromAddress = senderName ? `${senderName} <${senderEmail}>` : senderEmail
    await sendEmail({
      to,
      from: fromAddress,
      subject,
      html,
    })

    return NextResponse.json({
      success: true,
      message: "Test email sent successfully",
    })
  } catch (error) {
    console.error("Error sending test email:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { 
        error: "Failed to send test email",
        details: errorMessage,
        message: "Check server logs for more details. Common issues: Gmail requires App Password, check spam folder, verify SMTP credentials"
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

    // Verify SMTP connection
    const verification = await verifyConnection()
    
    return NextResponse.json({
      success: verification.success,
      error: verification.error,
      smtpConfig: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER ? "***configured***" : "not set",
        fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "not set",
        fromName: process.env.SMTP_FROM_NAME || "not set",
      },
    })
  } catch (error) {
    console.error("Error verifying SMTP:", error)
    return NextResponse.json(
      { error: "Failed to verify SMTP configuration" },
      { status: 500 }
    )
  }
}
