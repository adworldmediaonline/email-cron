import { NextRequest, NextResponse } from "next/server";
import {
  startCronWorker,
  isCronWorkerRunning,
  getCronWorkerStatus,
} from "@/lib/cron-worker";

/**
 * API endpoint to start the cron worker
 * Useful for development and manual control
 */
export async function POST(request: NextRequest) {
  try {
    if (isCronWorkerRunning()) {
      const status = getCronWorkerStatus();
      return NextResponse.json({
        success: true,
        message: "Cron worker is already running",
        ...status,
      });
    }

    startCronWorker();
    const status = getCronWorkerStatus();

    return NextResponse.json({
      success: true,
      message: "Cron worker started successfully",
      ...status,
    });
  } catch (error) {
    console.error("Error starting cron worker:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to start cron worker",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check cron worker status
 * Also auto-starts the worker if it's enabled but not running
 */
export async function GET(request: NextRequest) {
  const status = getCronWorkerStatus();
  const cronWorkerEnabled = process.env.ENABLE_CRON_WORKER === "true";
  
  // Auto-start if enabled but not running (fallback if instrumentation didn't work)
  if (!status.running && cronWorkerEnabled) {
    console.log("[API] Cron worker is enabled but not running. Attempting to start...");
    try {
      startCronWorker();
      const newStatus = getCronWorkerStatus();
      return NextResponse.json({
        ...newStatus,
        message: newStatus.running
          ? "Cron worker started successfully"
          : "Failed to start cron worker",
        environment: process.env.NODE_ENV,
        cronWorkerEnabled,
        autoStarted: true,
      });
    } catch (error) {
      console.error("[API] Failed to auto-start cron worker:", error);
    }
  }
  
  return NextResponse.json({
    ...status,
    message: status.running
      ? "Cron worker is running"
      : "Cron worker is not running",
    environment: process.env.NODE_ENV,
    cronWorkerEnabled,
    autoStarted: false,
  });
}
