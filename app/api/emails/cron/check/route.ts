import { NextRequest, NextResponse } from "next/server"

/**
 * Diagnostic endpoint to check cron configuration
 * This helps debug why scheduled emails might not be sending
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const nodeEnv = process.env.NODE_ENV

  const diagnostics = {
    environment: nodeEnv,
    cronSecretConfigured: !!cronSecret,
    cronSecretLength: cronSecret?.length || 0,
    authHeaderPresent: !!authHeader,
    authHeaderValue: authHeader ? "***" : null,
    vercelCronHeader: request.headers.get("x-vercel-cron") || null,
    timestamp: new Date().toISOString(),
    recommendations: [] as string[],
  }

  // Add recommendations
  if (!cronSecret) {
    diagnostics.recommendations.push(
      "CRON_SECRET is not set. Set it in Vercel Dashboard → Settings → Environment Variables"
    )
  } else if (cronSecret.length < 16) {
    diagnostics.recommendations.push(
      "CRON_SECRET should be at least 16 characters long for security"
    )
  }

  if (nodeEnv === "production" && !authHeader) {
    diagnostics.recommendations.push(
      "In production, Vercel should send Authorization header. Check if cron job is configured in vercel.json"
    )
  }

  if (nodeEnv === "development") {
    diagnostics.recommendations.push(
      "In development, cron jobs don't run automatically. Use 'Test Cron' button or call the endpoint manually"
    )
  }

  return NextResponse.json({
    success: true,
    diagnostics,
    message: diagnostics.recommendations.length === 0 
      ? "Configuration looks good!" 
      : "Please review the recommendations below",
  })
}
