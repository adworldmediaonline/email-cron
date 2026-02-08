# Cron Job Setup for Scheduled Emails

## Overview

Scheduled emails are processed automatically using a **dual approach**:

1. **Development & Local**: Cron worker via Next.js instrumentation hook (runs every minute)
2. **Production**: Vercel cron jobs (configured in `vercel.json`, runs every minute)

Both use the same processing logic, ensuring consistency across environments.

## Configuration

### 1. Vercel Cron Configuration

The cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/emails/cron",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This runs every minute (`*/1 * * * *`).

### 2. Environment Variable Setup

**IMPORTANT**: You must set `CRON_SECRET` in your Vercel project settings for the cron job to work in production.

#### Steps:

1. [ ] Go to your Vercel project dashboard: https://vercel.com/dashboard
2. [ ] Select your project
3. [ ] Navigate to **Settings** → **Environment Variables**
4. [ ] Add a new environment variable:
    - [ ] **Name**: `CRON_SECRET`
    - [ ] **Value**: Generate a secure random string (at least 16 characters)
    - [ ] **Environments**: Select **Production** (and Preview/Development if needed)
5. [ ] Click **Save**
6. [ ] **Redeploy** your project for the changes to take effect

#### Generate a secure secret:

```bash
# Using openssl
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Note**: After setting CRON_SECRET, you must redeploy your project for it to take effect!

### 3. How It Works

1. **Vercel automatically calls** `/api/emails/cron` every minute
2. **Vercel sends** `Authorization: Bearer <CRON_SECRET>` header
3. **Our endpoint verifies** the secret matches
4. **Processes** all campaigns with:
   - `status = "scheduled"`
   - `scheduledAt <= now()`

### 4. Development Mode (Local)

**The cron worker starts automatically** when you run `pnpm dev`!

#### How It Works:

1. When you run `pnpm dev`, it sets `ENABLE_CRON_WORKER=true`
2. Next.js `instrumentation.ts` detects this and starts the cron worker
3. The worker checks for scheduled campaigns **every 60 seconds** automatically
4. No manual intervention needed!

#### Verify It's Running:

**Check Console Logs** when starting the dev server:
```
[Instrumentation] 🔧 Initializing cron worker...
[Instrumentation] ✅ Cron worker started successfully
[Cron Worker] 🚀 Starting cron worker...
[Cron Worker] ✅ Cron worker started successfully
```

**Check Status via API**:
```bash
GET http://localhost:3000/api/cron/start
```

Response:
```json
{
  "running": true,
  "intervalMs": 60000,
  "message": "Cron worker is running",
  "environment": "development",
  "cronWorkerEnabled": true
}
```

#### Manual Control:

**Start/Check Status**:
```bash
# Check status
GET http://localhost:3000/api/cron/start

# Start manually (if not running)
POST http://localhost:3000/api/cron/start
```

**Manual Test Endpoint** (also works):
```bash
# Test the cron endpoint directly
curl http://localhost:3000/api/emails/cron
```

#### Using the Dashboard:

Click the **"Test Cron"** button in the dashboard to manually trigger the cron job.

### 5. Troubleshooting

#### Cron Worker Not Starting in Development:

1. **Check Environment Variable**:
   - Ensure you're running `pnpm dev` (not `pnpm dev:no-cron`)
   - The script sets `ENABLE_CRON_WORKER=true` automatically
   - Or set it manually in `.env`: `ENABLE_CRON_WORKER=true`

2. **Check Console Logs**:
   - Look for `[Instrumentation]` messages when starting the dev server
   - If you see "Cron worker disabled in development", the env var isn't set correctly

3. **Verify Next.js Configuration**:
   - Check `next.config.ts` has `experimental.instrumentationHook: true`
   - Verify `instrumentation.ts` exists in the project root

4. **Manual Start**:
   - If automatic start fails, use `POST /api/cron/start` to start manually
   - Check status with `GET /api/cron/start`

#### Emails not sending automatically:

**For Development:**
- Check if cron worker is running: `GET /api/cron/start`
- Look for `[Cron Worker]` logs in console
- Verify campaigns have `status = "SCHEDULED"` and `scheduledAt <= now()`

**For Production:**
1. **Check CRON_SECRET is set**:

   - Go to Vercel Dashboard → Settings → Environment Variables
   - Verify `CRON_SECRET` exists and is set for **Production**
   - **Important**: After adding/updating CRON_SECRET, you must **redeploy** your project
   - Use the "Check Cron Config" button in dashboard to verify
2. **Verify Cron Job is Enabled**:

   - Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
   - Verify the cron job `/api/emails/cron` is listed and enabled
   - If not listed, make sure `vercel.json` is committed and deployed
3. **Check Vercel Cron Logs**:

   - Go to Vercel Dashboard → Your Project → **Deployments** → Select latest deployment
   - Click on **Functions** tab
   - Look for `/api/emails/cron` function
   - Check **Logs** for execution history and errors
   - Look for `[Cron]` prefixed logs
4. **Verify Campaign Status**:

   - Campaigns must have `status = "scheduled"` (lowercase)
   - `scheduledAt` must be in the past or current time
   - Check database to verify campaign status
5. **Check Function Logs**:

   - Look for `[Cron]` prefixed logs in Vercel function logs
   - These show what campaigns are being processed
   - Check for authentication errors (401 Unauthorized)
6. **Test Manually**:

   - Use the **"Test Cron"** button in dashboard (works in development)
   - Use the **"Check Cron Config"** button to verify setup
   - Or call the endpoint directly: `GET /api/emails/cron`
7. **Common Issues**:

   - **Cron job not running**: Check if cron is enabled in Vercel dashboard
   - **401 Unauthorized**: CRON_SECRET not set or doesn't match
   - **No campaigns processed**: Check campaign status and scheduledAt date
   - **Function timeout**: Too many campaigns - increase `maxDuration` in vercel.json

#### Common Issues:

- **"Unauthorized" error**: CRON_SECRET not set or doesn't match
- **No campaigns processed**: No campaigns with `status = "scheduled"` and `scheduledAt <= now()`
- **Function timeout**: Too many campaigns/recipients - increase `maxDuration` in `vercel.json`

### 6. Monitoring

The cron job logs important information:

- `[Cron] Cron job triggered at <timestamp>`
- `[Cron] Starting scheduled email processing`
- `[Cron] Found X scheduled campaign(s) to process`
- `[Cron] Campaign X completed: Y sent, Z failed`
- `[Cron] Completed: X campaign(s) processed`

**Where to check logs**:

1. Vercel Dashboard → Your Project → Deployments → Latest → Functions → `/api/emails/cron` → Logs
2. Or use Vercel CLI: `vercel logs --follow`

**Dashboard Tools**:

- **"Test Cron"** button: Manually trigger cron job (works in dev)
- **"Check Cron Config"** button: Verify CRON_SECRET and configuration

### 7. Rate Limiting

The cron job processes:

- Maximum 50 campaigns per run
- 10 emails per batch
- 1 second delay between batches
- 500ms delay between campaigns

This prevents overwhelming the SMTP server.
