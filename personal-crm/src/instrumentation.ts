// Next.js runs this once when the server boots. We use it to start the
// in-process cron scheduler — but only in the Node.js runtime (not edge) and
// only when scheduling is enabled.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { config } = await import("./lib/env");
  if (!config.enableScheduler) {
    console.log("[instrumentation] scheduler disabled (ENABLE_SCHEDULER=false)");
    return;
  }

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
