import type { ReactNode } from "react"
import { Resend } from "resend"

let resendClient: Resend | null = null

function getResendClient(): Resend {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey?.trim()) {
    throw new Error("RESEND_API_KEY is required. Set it in your environment variables.")
  }
  resendClient = new Resend(apiKey)
  return resendClient
}

/**
 * Format From address per RFC 5322 for proper display in email clients.
 * When senderName is empty or matches local part (e.g. "info" for info@domain.com),
 * falls back to RESEND_FROM_NAME so inbox shows a proper name instead of the local part.
 */
export function formatFromAddress(name: string | undefined, email: string): string {
  const addr = email.trim()
  if (!addr) {
    return getDefaultFrom()
  }
  const localPart = addr.split("@")[0]?.toLowerCase() ?? ""
  let displayName = name?.trim()
  if (!displayName || displayName.toLowerCase() === localPart) {
    displayName = process.env.RESEND_FROM_NAME?.trim() ?? ""
  }
  if (!displayName || displayName.toLowerCase() === localPart) {
    return `"${addr}" <${addr}>`
  }
  return `"${displayName}" <${addr}>`
}

function stripHtmlToText(html: string): string {
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

/** Get From address from RESEND_FROM_EMAIL + RESEND_FROM_NAME. Use when sending so env is source of truth. */
export function getDefaultFrom(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim() ?? ""
  const name = process.env.RESEND_FROM_NAME?.trim()
  return formatFromAddress(name, email)
}

function getReplyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO?.trim() || undefined
}

function getListUnsubscribeHeaders(): Record<string, string> {
  const url = process.env.UNSUBSCRIBE_URL?.trim()
  if (!url) return {}
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
  const mailto = process.env.UNSUBSCRIBE_MAILTO?.trim()
  if (mailto) {
    headers["List-Unsubscribe"] = `<mailto:${mailto}?subject=Unsubscribe>, <${url}>`
  }
  return headers
}

/** Send with raw HTML (or React Email via `react`) */
export interface SendEmailHtmlOptions {
  to: string | string[]
  subject: string
  html?: string
  /** React Email component; Resend renders to HTML (requires @react-email/render) */
  react?: ReactNode
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  idempotencyKey?: string
}

/** Send with Resend-hosted template (dashboard or API) */
export interface SendEmailTemplateOptions {
  to: string | string[]
  template: { id: string; variables?: Record<string, string | number> }
  from?: string
  subject?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  idempotencyKey?: string
}

export type SendEmailOptions = SendEmailHtmlOptions | SendEmailTemplateOptions

function isTemplateOptions(
  opts: SendEmailOptions
): opts is SendEmailTemplateOptions {
  return "template" in opts && opts.template != null
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send email via Resend API.
 * Supports: raw HTML, React Email (react), or Resend-hosted templates.
 *
 * From address (Resend best practice):
 * - Use format "Display Name <email@domain.com>" via formatFromAddress() or getDefaultFrom()
 * - When `from` is omitted, uses RESEND_FROM_EMAIL + RESEND_FROM_NAME from env
 * - Pass explicit `from` when using campaign-specific sender
 *
 * Best practices: idempotency keys for retries, plain-text fallback, List-Unsubscribe for deliverability.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResendClient()

    const to = Array.isArray(options.to) ? options.to : [options.to]
    const from = options.from || getDefaultFrom()
    const replyTo = options.replyTo || getReplyTo()
    const headers: Record<string, string> = {
      "X-Priority": "3",
      "X-MSMail-Priority": "Normal",
      Importance: "normal",
      ...getListUnsubscribeHeaders(),
    }

    if (isTemplateOptions(options)) {
      const { data, error } = await resend.emails.send(
        {
          from,
          to,
          subject: options.subject,
          template: options.template,
          replyTo: replyTo ? [replyTo] : undefined,
          cc: options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined,
          bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : undefined,
          headers,
        },
        options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
      )
      if (error) return { success: false, error: error.message || "Failed to send email" }
      return { success: true, messageId: data?.id }
    }

    const htmlOpts = options as SendEmailHtmlOptions
    const sendOpts = htmlOpts.react
      ? {
        from,
        to,
        subject: htmlOpts.subject,
        react: htmlOpts.react,
        replyTo: replyTo ? [replyTo] : undefined,
        cc: htmlOpts.cc ? (Array.isArray(htmlOpts.cc) ? htmlOpts.cc : [htmlOpts.cc]) : undefined,
        bcc: htmlOpts.bcc ? (Array.isArray(htmlOpts.bcc) ? htmlOpts.bcc : [htmlOpts.bcc]) : undefined,
        headers,
      }
      : {
        from,
        to,
        subject: htmlOpts.subject,
        html: htmlOpts.html ?? "",
        text: htmlOpts.text ?? stripHtmlToText(htmlOpts.html ?? ""),
        replyTo: replyTo ? [replyTo] : undefined,
        cc: htmlOpts.cc ? (Array.isArray(htmlOpts.cc) ? htmlOpts.cc : [htmlOpts.cc]) : undefined,
        bcc: htmlOpts.bcc ? (Array.isArray(htmlOpts.bcc) ? htmlOpts.bcc : [htmlOpts.bcc]) : undefined,
        headers,
      }

    const { data, error } = await resend.emails.send(
      sendOpts,
      htmlOpts.idempotencyKey ? { idempotencyKey: htmlOpts.idempotencyKey } : undefined
    )

    if (error) {
      return { success: false, error: error.message || "Failed to send email" }
    }

    return { success: true, messageId: data?.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export interface SendBulkEmailsOptions {
  batchSize?: number
  delayBetweenBatches?: number
  from?: string
  replyTo?: string
  /** Prefix for idempotency keys (e.g. campaign ID). Resend best practice for safe retries. */
  idempotencyKeyPrefix?: string
}

/**
 * Send bulk emails via Resend batch API (up to 100 per call).
 * Uses idempotency keys per batch for safe retries.
 */
export interface SendBulkEmailResult {
  to: string
  success: boolean
  error?: string
  resendEmailId?: string
}

export async function sendBulkEmails(
  emails: Array<{ to: string; subject: string; html: string; text?: string }>,
  options?: SendBulkEmailsOptions
): Promise<SendBulkEmailResult[]> {
  const batchSize = Math.min(options?.batchSize ?? 10, 100)
  const delayBetweenBatches = options?.delayBetweenBatches ?? 1000
  const from = options?.from || getDefaultFrom()
  const replyTo = options?.replyTo || getReplyTo()
  const headers = getListUnsubscribeHeaders()

  const results: SendBulkEmailResult[] = []

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const batchIndex = Math.floor(i / batchSize)

    const batchPayload = batch.map((email) => ({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text ?? stripHtmlToText(email.html),
      replyTo: replyTo ? [replyTo] : undefined,
      headers,
    }))

    try {
      const resend = getResendClient()
      const idempotencyKey = options?.idempotencyKeyPrefix
        ? `${options.idempotencyKeyPrefix}-batch-${batchIndex}`
        : undefined

      const { data, error } = await resend.batch.send(batchPayload, {
        idempotencyKey,
      })

      if (error) {
        batch.forEach((e) =>
          results.push({ to: e.to, success: false, error: error.message || "Batch send failed" })
        )
      } else if (data?.data) {
        data.data.forEach((item, idx) => {
          results.push({
            to: batch[idx]?.to ?? "unknown",
            success: !!item?.id,
            error: item?.id ? undefined : "No email ID returned",
            resendEmailId: item?.id,
          })
        })
      } else {
        batch.forEach((e) =>
          results.push({ to: e.to, success: false, error: "No response data" })
        )
      }
    } catch (err) {
      batch.forEach((e) =>
        results.push({
          to: e.to,
          success: false,
          error: err instanceof Error ? err.message : "Failed to send",
        })
      )
    }

    if (i + batchSize < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
    }
  }

  return results
}

/**
 * Retrieve email details from Resend by ID.
 */
export async function getEmailById(
  resendEmailId: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const resend = getResendClient()
    const { data, error } = await resend.emails.get(resendEmailId)
    if (error) {
      return { success: false, error: error.message || "Failed to fetch email" }
    }
    return { success: true, data: data as unknown as Record<string, unknown> }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

/**
 * Verify Resend API connection (e.g. domains.list).
 */
export async function verifyConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY?.trim()) {
      return { success: false, error: "RESEND_API_KEY is not set" }
    }
    const resend = getResendClient()
    const { error } = await resend.domains.list({ limit: 1 })
    if (error) {
      return { success: false, error: error.message || "API key may be invalid" }
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

/**
 * Reset client (e.g. for tests). Resend is stateless; no connections to close.
 */
export function resetEmailClient(): void {
  resendClient = null
}
