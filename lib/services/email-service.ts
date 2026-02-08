import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (transporter) {
    return transporter
  }

  // Validate SMTP configuration
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error(
      "SMTP configuration missing. Please set SMTP_USER and SMTP_PASSWORD environment variables."
    )
  }

  // Create reusable transporter using SMTP with connection pooling
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // Connection pool options - CRITICAL for reliable email sending
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // Rate limiting built into transporter
    rateDelta: 1000, // 1 second
    rateLimit: 10, // 10 messages per rateDelta
    // Connection timeout settings
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
  })

  // Verify connection (async, don't block)
  transporter.verify((error) => {
    if (error) {
      console.error("SMTP connection error:", error)
      console.error(
        "Please check your SMTP configuration in .env file."
      )
    } else {
      console.log("SMTP server is ready to send emails")
    }
  })

  return transporter
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send email using Nodemailer with best practices
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const emailTransporter = getTransporter()

    const mailOptions: any = {
      from: options.from || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || stripHtml(options.html),
      replyTo: options.replyTo,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(", ") : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(", ") : options.bcc) : undefined,
      // Best practices headers
      headers: {
        "X-Priority": "3", // Normal priority
        "X-MSMail-Priority": "Normal",
        "Importance": "normal",
        // List-Unsubscribe header for compliance
        ...(process.env.UNSUBSCRIBE_URL && {
          "List-Unsubscribe": `<${process.env.UNSUBSCRIBE_URL}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }),
      },
    }

    const info = await emailTransporter.sendMail(mailOptions)

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (error) {
    console.error("Error sending email:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}


/**
 * Send bulk emails with rate limiting and error handling
 * Matches working project pattern exactly
 */
export async function sendBulkEmails(
  emails: Array<{ to: string; subject: string; html: string; text?: string }>,
  options?: {
    batchSize?: number
    delayBetweenBatches?: number
  }
): Promise<Array<{ to: string; success: boolean; error?: string }>> {
  const batchSize = options?.batchSize || 10
  const delayBetweenBatches = options?.delayBetweenBatches || 1000 // 1 second

  const results: Array<{ to: string; success: boolean; error?: string }> = []

  // Process in batches to avoid overwhelming the SMTP server
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)

    const batchResults = await Promise.allSettled(
      batch.map(async (email) => {
        const result = await sendEmail({
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })

        return {
          to: email.to,
          success: result.success,
          error: result.error,
        }
      })
    )

    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value)
      } else {
        results.push({
          to: "unknown",
          success: false,
          error: result.reason?.message || "Failed to send",
        })
      }
    })

    // Delay between batches to respect rate limits
    if (i + batchSize < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
    }
  }

  return results
}

/**
 * Close transporter connections (useful for cleanup)
 */
/**
 * Verify SMTP connection
 */
export async function verifyConnection(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const emailTransporter = getTransporter()
    await emailTransporter.verify()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function closeEmailConnections(): Promise<void> {
  if (transporter) {
    transporter.close()
    transporter = null
  }
}
