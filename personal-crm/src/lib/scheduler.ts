import cron from "node-cron";
import { config } from "./env";
import { syncGranola } from "./sync";
import { runDigest } from "./digest";
import { runNudge } from "./nudge";

let started = false;

/**
 * Start the in-process cron scheduler. Safe to call multiple times — it only
 * schedules once. Runs inside the long-lived Node server (fine on Railway,
 * where a paid service stays warm). If you'd rather drive these from an
 * external scheduler, set ENABLE_SCHEDULER=false and hit the API endpoints.
 */
export function startScheduler(): void {
  if (started) return;
  started = true;

  const tz = config.timezone;

  if (config.granolaSyncCron && cron.validate(config.granolaSyncCron)) {
    cron.schedule(
      config.granolaSyncCron,
      async () => {
        try {
          const r = await syncGranola();
          console.log("[scheduler] granola sync", JSON.stringify(r));
        } catch (err) {
          console.error("[scheduler] granola sync failed", err);
        }
      },
      { timezone: tz },
    );
    console.log(`[scheduler] Granola sync scheduled: ${config.granolaSyncCron} (${tz})`);
  } else {
    console.warn(`[scheduler] invalid GRANOLA_SYNC_CRON: ${config.granolaSyncCron}`);
  }

  if (config.digestCron && cron.validate(config.digestCron)) {
    cron.schedule(
      config.digestCron,
      async () => {
        try {
          const r = await runDigest();
          console.log("[scheduler] digest", JSON.stringify({ empty: r.empty, slack: r.slack }));
        } catch (err) {
          console.error("[scheduler] digest failed", err);
        }
      },
      { timezone: tz },
    );
    console.log(`[scheduler] Digest scheduled: ${config.digestCron} (${tz})`);
  } else {
    console.warn(`[scheduler] invalid DIGEST_CRON: ${config.digestCron}`);
  }

  if (config.dailyNudgeCron && cron.validate(config.dailyNudgeCron)) {
    cron.schedule(
      config.dailyNudgeCron,
      async () => {
        try {
          const r = await runNudge();
          console.log("[scheduler] nudge", JSON.stringify({ empty: r.empty, slack: r.slack }));
        } catch (err) {
          console.error("[scheduler] nudge failed", err);
        }
      },
      { timezone: tz },
    );
    console.log(`[scheduler] Daily nudge scheduled: ${config.dailyNudgeCron} (${tz})`);
  } else {
    console.warn(`[scheduler] invalid DAILY_NUDGE_CRON: ${config.dailyNudgeCron}`);
  }
}
