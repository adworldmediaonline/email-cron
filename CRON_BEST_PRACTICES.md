# Vercel Cron Jobs - Best Practices Implementation

This document outlines the best practices implemented in this project according to Vercel's official documentation.

## ✅ Implemented Best Practices

### 1. Security (CRON_SECRET)

✅ **Implemented**: Endpoint verifies `Authorization: Bearer <CRON_SECRET>` header
- Vercel automatically sends CRON_SECRET as Authorization header
- Production requires CRON_SECRET, development allows testing without it
- Matches Vercel documentation pattern exactly

**File**: `app/api/emails/cron/route.ts`

### 2. Idempotency

✅ **Implemented**: All database operations are idempotent

**Campaign Processing**:
- Uses `updateMany` with status check: Only updates if status is still `SCHEDULED`
- Prevents duplicate processing if cron job runs multiple times
- Example: `updateMany({ where: { id, status: SCHEDULED }, data: { status: SENDING } })`

**Recipient Processing**:
- Uses `updateMany` with status check: Only updates if status is still `PENDING`
- Prevents duplicate email sends
- Example: `updateMany({ where: { id, status: PENDING }, data: { status: SENT } })`

**File**: `lib/services/cron-service.ts`

### 3. Race Condition Prevention

✅ **Implemented**: Atomic database updates prevent concurrent execution issues

**Mechanisms**:
1. **Campaign Claiming**: Atomic update from `SCHEDULED` → `SENDING`
   - If update affects 0 rows, another process already claimed it
   - Skips processing to avoid duplicates

2. **Status Verification**: Re-fetches campaign before processing
   - Ensures we have latest data
   - Verifies status is still `SENDING` before proceeding

3. **Recipient Updates**: Atomic updates from `PENDING` → `SENT`
   - Only updates recipients that are still pending
   - Prevents duplicate sends

**File**: `lib/services/cron-service.ts`

### 4. Error Handling

✅ **Implemented**: Comprehensive error handling

- Try-catch blocks around all critical operations
- Errors are logged with context
- Failed campaigns are marked as `FAILED` status
- Errors are collected and returned in response
- Prisma Accelerate resource limit errors are handled gracefully

**File**: `lib/services/cron-service.ts`, `app/api/emails/cron/route.ts`

### 5. Response Format

✅ **Implemented**: Consistent JSON responses

- Success: Returns `{ success: true, processed, sent, failed, errors, duration, timestamp }`
- Error: Returns `{ success: false, error, message, duration, timestamp }` with 500 status
- Uses `Response.json()` (TypeScript 5.2+ pattern per Vercel docs)

**File**: `app/api/emails/cron/route.ts`

### 6. Configuration (vercel.json)

✅ **Implemented**: Proper Vercel cron configuration

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/emails/cron",
      "schedule": "*/1 * * * *"
    }
  ],
  "functions": {
    "app/api/emails/cron/route.ts": {
      "maxDuration": 300
    }
  }
}
```

- Includes `$schema` for validation
- Path matches route file location
- maxDuration set to 300 seconds (5 minutes)
- Schedule runs every minute

**File**: `vercel.json`

### 7. Rate Limiting & Performance

✅ **Implemented**: Prevents overwhelming SMTP server

- Maximum 50 campaigns per run
- 10 emails per batch
- 1 second delay between batches
- 500ms delay between campaigns
- Limits prevent timeout and resource exhaustion

**File**: `lib/services/cron-service.ts`

### 8. Logging

✅ **Implemented**: Comprehensive logging for debugging

- Logs cron job trigger time
- Logs campaign processing start/completion
- Logs email send results
- Logs errors with context
- Debug queries only run in development (reduces Prisma Accelerate load)

**File**: `lib/services/cron-service.ts`, `app/api/emails/cron/route.ts`

### 9. Local Testing

✅ **Implemented**: Easy local testing

- Endpoint accessible at `http://localhost:3000/api/emails/cron`
- Development mode allows access without CRON_SECRET
- Supports both GET and POST methods
- Diagnostic endpoint at `/api/emails/cron/check`

**File**: `app/api/emails/cron/route.ts`, `app/api/emails/cron/check/route.ts`

### 10. Resource Limit Handling

✅ **Implemented**: Graceful handling of Prisma Accelerate limits

- Catches "Worker exceeded resource limits" errors
- Returns early with error message instead of crashing
- Debug queries disabled in production to reduce load
- Main query handles resource limit errors gracefully

**File**: `lib/services/cron-service.ts`

## 🔒 Security Checklist

- ✅ CRON_SECRET verification in production
- ✅ Authorization header validation
- ✅ Development mode allows testing without secret
- ✅ Error messages don't leak sensitive information

## 🎯 Idempotency Checklist

- ✅ Campaign status updates are atomic (SCHEDULED → SENDING)
- ✅ Recipient status updates are atomic (PENDING → SENT)
- ✅ Operations check current status before updating
- ✅ Safe to run multiple times with same result

## ⚡ Performance Checklist

- ✅ Limits on campaigns per run (50)
- ✅ Batch processing with delays
- ✅ Rate limiting for email sends
- ✅ Debug queries disabled in production
- ✅ maxDuration configured (300 seconds)

## 📊 Monitoring Checklist

- ✅ Comprehensive logging
- ✅ Duration tracking
- ✅ Error collection and reporting
- ✅ Success/failure counts
- ✅ Timestamp in responses

## 🚀 Deployment Checklist

- ✅ vercel.json configured correctly
- ✅ CRON_SECRET environment variable documented
- ✅ maxDuration set appropriately
- ✅ Path matches route file location
- ✅ Schema validation included

## Summary

This implementation follows all Vercel cron job best practices:

1. ✅ **Security**: CRON_SECRET verification
2. ✅ **Idempotency**: All operations are safe to run multiple times
3. ✅ **Race Conditions**: Atomic updates prevent concurrent execution issues
4. ✅ **Error Handling**: Comprehensive error handling and logging
5. ✅ **Performance**: Rate limiting and resource management
6. ✅ **Monitoring**: Detailed logging and metrics
7. ✅ **Configuration**: Proper vercel.json setup

The cron job is production-ready and follows Vercel's official documentation patterns.
