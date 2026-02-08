/**
 * Next.js Instrumentation Hook
 * This file runs once when the server starts
 * Perfect for starting background workers
 * 
 * In development: Starts cron worker when ENABLE_CRON_WORKER=true
 * In production: Starts cron worker as backup (Vercel cron jobs are primary)
 */

export async function register() {
  console.log("[Instrumentation] 🚀 Register function called");
  console.log(`[Instrumentation] NEXT_RUNTIME: ${process.env.NEXT_RUNTIME || "not set"}`);
  console.log(`[Instrumentation] NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
  console.log(`[Instrumentation] ENABLE_CRON_WORKER: ${process.env.ENABLE_CRON_WORKER || "not set"}`);
  
  // Only start cron worker in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const isDevelopment = process.env.NODE_ENV === "development";
    const isProduction = process.env.NODE_ENV === "production";
    const cronWorkerEnabled = process.env.ENABLE_CRON_WORKER === "true";
    
    console.log(`[Instrumentation] Runtime check passed: nodejs`);
    console.log(`[Instrumentation] isDevelopment: ${isDevelopment}, isProduction: ${isProduction}, cronWorkerEnabled: ${cronWorkerEnabled}`);
    
    // Start automatically in production, or when explicitly enabled in development
    const shouldStart = isProduction || cronWorkerEnabled;
    console.log(`[Instrumentation] shouldStart: ${shouldStart}`);

    if (shouldStart) {
      try {
        console.log("[Instrumentation] 🔧 Initializing cron worker...");
        console.log(`[Instrumentation] Environment: ${process.env.NODE_ENV || "unknown"}`);
        console.log(`[Instrumentation] ENABLE_CRON_WORKER: ${process.env.ENABLE_CRON_WORKER || "not set"}`);
        
        // Use dynamic import - try without extension first (TypeScript/Next.js style)
        const cronWorkerModule = await import("./lib/cron-worker");
        console.log("[Instrumentation] ✅ Successfully imported cron-worker module");
        console.log("[Instrumentation] Available exports:", Object.keys(cronWorkerModule));
        
        if (typeof cronWorkerModule.startCronWorker === "function") {
          cronWorkerModule.startCronWorker();
          console.log("[Instrumentation] ✅ Cron worker started successfully");
          console.log("[Instrumentation] 📧 Scheduled emails will be processed every minute");
        } else {
          console.error("[Instrumentation] ❌ startCronWorker is not a function");
        }
        
        if (isDevelopment) {
          console.log("[Instrumentation] 💡 Development mode: Cron worker is active");
          console.log("[Instrumentation] 💡 Production: Vercel cron jobs will also run");
        }
      } catch (error) {
        console.error("[Instrumentation] ❌ Failed to start cron worker:", error);
        if (error instanceof Error) {
          console.error("[Instrumentation] Error details:", error.message);
          console.error("[Instrumentation] Stack:", error.stack);
        }
        // Try alternative import path with @ alias
        try {
          console.log("[Instrumentation] 🔄 Trying alternative import path with @ alias...");
          const cronWorkerModuleAlt = await import("@/lib/cron-worker");
          if (typeof cronWorkerModuleAlt.startCronWorker === "function") {
            cronWorkerModuleAlt.startCronWorker();
            console.log("[Instrumentation] ✅ Cron worker started with @ alias import");
          }
        } catch (altError) {
          console.error("[Instrumentation] ❌ Alternative import also failed:", altError);
        }
      }
    } else {
      if (isDevelopment) {
        console.log("[Instrumentation] ⚠️  Cron worker disabled in development.");
        console.log("[Instrumentation] 💡 To enable: Set ENABLE_CRON_WORKER=true in .env");
        console.log("[Instrumentation] 💡 Or use 'pnpm dev' which enables it automatically.");
        console.log("[Instrumentation] 💡 You can also manually trigger via /api/cron/start");
      }
    }
  } else {
    console.log(`[Instrumentation] ⚠️  Cron worker skipped (Runtime: ${process.env.NEXT_RUNTIME || "unknown"})`);
  }
}
