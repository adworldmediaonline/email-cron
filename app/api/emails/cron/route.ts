import type { NextRequest } from "next/server"
import { processScheduledEmails } from "@/lib/services/cron-service"

/**
 * Vercel Cron Job Endpoint
 * 
 * This endpoint is called by Vercel cron jobs according to the schedule in vercel.json
 * 
 * Security: Vercel automatically sends CRON_SECRET as Authorization header
 * Format: Authorization: Bearer <CRON_SECRET>
 * 
 * For local testing: Visit http://localhost:3000/api/emails/cron
 * Note: In development, the endpoint allows access without CRON_SECRET for easier testing
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Verify CRON_SECRET per Vercel documentation
  // Vercel automatically sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  // In development, allow access without secret for easier testing
  // In production, require CRON_SECRET (per Vercel security best practices)
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      return new Response("Unauthorized: CRON_SECRET not configured", {
        status: 401,
      })
    }

    // Verify Authorization header matches CRON_SECRET exactly
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", {
        status: 401,
      })
    }
  }

  try {
    // Process scheduled emails
    const result = await processScheduledEmails()

    const duration = Date.now() - startTime

    return Response.json({
      success: true,
      message: "Cron job executed successfully",
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      duration,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const duration = Date.now() - startTime

    return Response.json(
      {
        success: false,
        error: "Failed to process scheduled emails",
        message: error instanceof Error ? error.message : "Unknown error",
        duration,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
