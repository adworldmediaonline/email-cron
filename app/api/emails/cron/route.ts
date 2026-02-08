import { NextRequest, NextResponse } from "next/server"
import { processScheduledEmails } from "@/lib/services/cron-service"

// Verify cron secret to prevent unauthorized access
// Vercel cron jobs send CRON_SECRET as Bearer token in Authorization header
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  // In development, allow access without secret for easier testing
  if (process.env.NODE_ENV === "development") {
    console.log("[Cron] Development mode - allowing access")
    return true
  }

  // In production, require CRON_SECRET
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not set in production")
    return false
  }

  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  // Also support manual testing with ?secret= query param
  const providedSecret =
    authHeader?.replace("Bearer ", "").trim() ||
    request.nextUrl.searchParams.get("secret")

  const isValid = providedSecret === cronSecret
  
  if (!isValid) {
    console.warn("[Cron] Invalid secret provided", {
      hasAuthHeader: !!authHeader,
      hasSecret: !!providedSecret,
    })
  }

  return isValid
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Verify cron secret
    if (!verifyCronSecret(request)) {
      console.error("[Cron] Authentication failed - check CRON_SECRET environment variable")
      return NextResponse.json(
        { 
          error: "Unauthorized",
          message: "CRON_SECRET must be set in Vercel environment variables. See CRON_SETUP.md for instructions."
        },
        { status: 401 }
      )
    }

    console.log("[Cron] Cron job triggered at", new Date().toISOString())

    // Process scheduled emails
    const result = await processScheduledEmails()

    const duration = Date.now() - startTime

    console.log(`[Cron] Job completed in ${duration}ms: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed`)

    return NextResponse.json({
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
    console.error("[Cron] Fatal error processing scheduled campaigns:", error)
    return NextResponse.json(
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
