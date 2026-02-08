/**
 * Cron Worker - Automatically processes scheduled emails
 * Runs continuously and checks for scheduled campaigns every minute
 */

import { processScheduledEmails } from "./services/cron-service";

const CRON_INTERVAL_MS = 60 * 1000; // 1 minute

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

// Prevent concurrent execution
let isProcessing = false;

/**
 * Start the cron worker
 */
export function startCronWorker(): void {
  if (intervalId) {
    console.log("[Cron Worker] ⚠️  Already running, skipping start");
    return;
  }

  console.log("[Cron Worker] 🚀 Starting cron worker...");
  console.log(`[Cron Worker] ⏰ Will check for scheduled campaigns every ${CRON_INTERVAL_MS / 1000} seconds`);

  // Run immediately on start
  processScheduledEmails()
    .then((result) => {
      console.log("[Cron Worker] ✅ Initial check completed");
      if (result.processed > 0) {
        console.log(
          `[Cron Worker] 📊 Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}`
        );
      }
    })
    .catch((error) => {
      console.error("[Cron Worker] ❌ Initial run error:", error);
      if (error instanceof Error) {
        console.error("[Cron Worker] Error details:", error.message);
      }
    });

  // Then run every minute
  // Note: This checks every minute, but only PROCESSES campaigns that have reached their scheduled time
  // This is the correct behavior - we need to check periodically to see if any scheduled campaigns are ready
  intervalId = setInterval(() => {
    // Prevent concurrent execution
    if (isProcessing) {
      console.log("[Cron Worker] ⚠️  Already processing, skipping this run");
      return;
    }
    
    isProcessing = true;
    processScheduledEmails()
      .then((result) => {
        if (result.processed > 0) {
          console.log(
            `[Cron Worker] 📊 Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}`
          );
        }
        // Only log when there are campaigns to process, to reduce noise
        // The cron-service.ts will log when it finds campaigns
      })
      .catch((error) => {
        console.error("[Cron Worker] ❌ Scheduled run error:", error);
        if (error instanceof Error) {
          console.error("[Cron Worker] Error details:", error.message);
        }
      })
      .finally(() => {
        isProcessing = false;
      });
  }, CRON_INTERVAL_MS);

  console.log("[Cron Worker] ✅ Cron worker started successfully");
}

/**
 * Stop the cron worker
 */
export function stopCronWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Cron Worker] 🛑 Stopped");
  } else {
    console.log("[Cron Worker] ⚠️  Not running, nothing to stop");
  }
}

/**
 * Check if cron worker is running
 */
export function isCronWorkerRunning(): boolean {
  return intervalId !== null;
}

/**
 * Get cron worker status information
 */
export function getCronWorkerStatus(): {
  running: boolean;
  intervalMs: number;
} {
  return {
    running: isCronWorkerRunning(),
    intervalMs: CRON_INTERVAL_MS,
  };
}
