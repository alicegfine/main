// Small typed helpers for reading env vars.

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function envBool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v.toLowerCase() === "yes";
}

export function envNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  get granolaApiKey() {
    return env("GRANOLA_API_KEY");
  },
  get granolaApiBase() {
    return env("GRANOLA_API_BASE") ?? "https://public-api.granola.ai/v1";
  },
  get granolaAutoCreateContacts() {
    return envBool("GRANOLA_AUTO_CREATE_CONTACTS", true);
  },
  get ownerEmails(): string[] {
    return (env("OWNER_EMAIL") ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get slackWebhookUrl() {
    return env("SLACK_WEBHOOK_URL");
  },
  get coldAfterDays() {
    return envNumber("COLD_AFTER_DAYS", 21);
  },
  get enableScheduler() {
    return envBool("ENABLE_SCHEDULER", true);
  },
  get granolaSyncCron() {
    return env("GRANOLA_SYNC_CRON") ?? "0 */2 * * *";
  },
  get digestCron() {
    return env("DIGEST_CRON") ?? "0 8 * * 1";
  },
  get timezone() {
    return env("TZ") ?? "America/New_York";
  },
  get cronSecret() {
    return env("CRON_SECRET");
  },
  get appPassword() {
    return env("APP_PASSWORD");
  },
  get appSecret() {
    return env("APP_SECRET") ?? "insecure-dev-secret-change-me";
  },
};
