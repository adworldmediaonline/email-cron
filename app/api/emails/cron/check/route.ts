import type { NextRequest } from "next/server"

/**
 * Diagnostic endpoint to check Vercel cron job configuration
 * This helps debug why scheduled emails might not be sending
 * 
 * Used by the dashboard "Check Cron Config" button
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const nodeEnv = process.env.NODE_ENV

  const diagnostics = {
    environment: nodeEnv || "unknown",
    cronSecretConfigured: !!cronSecret,
    cronSecretLength: cronSecret?.length || 0,
    authHeaderPresent: !!authHeader,
    authHeaderMatches: authHeader === `Bearer ${cronSecret}`,
    timestamp: new Date().toISOString(),
    recommendations: [] as string[],
  }

  // Add recommendations based on Vercel cron job requirements
  if (!cronSecret) {
    diagnostics.recommendations.push(
      "CRON_SECRET is not set. Set it in Vercel Dashboard → Settings → Environment Variables → Production"
    )
  } else if (cronSecret.length < 16) {
    diagnostics.recommendations.push(
      "CRON_SECRET should be at least 16 characters long for security (recommended: 32+ characters)"
    )
  }

  if (nodeEnv === "production") {
    if (!authHeader) {
      diagnostics.recommendations.push(
        "In production, Vercel should send Authorization header. Verify cron job is enabled in Vercel Dashboard → Settings → Cron Jobs"
      )
    } else if (!diagnostics.authHeaderMatches) {
      diagnostics.recommendations.push(
        "Authorization header doesn't match CRON_SECRET. Verify CRON_SECRET is set correctly in Vercel environment variables"
      )
    }
  }

  if (nodeEnv === "development") {
    diagnostics.recommendations.push(
      "In development, Vercel cron jobs don't run automatically. Test by visiting http://localhost:3000/api/emails/cron"
    )
  }

  // Check if vercel.json exists and has cron configuration
  diagnostics.recommendations.push(
    "Verify vercel.json contains cron configuration: { \"crons\": [{ \"path\": \"/api/emails/cron\", \"schedule\": \"*/1 * * * *\" }] }"
  )

  return Response.json({
    success: true,
    diagnostics,
    message:
      diagnostics.recommendations.length === 0
        ? "Configuration looks good! Cron job should work in production."
        : "Please review the recommendations below",
  })
}
