import { config } from "./env";

export interface SlackResult {
  sent: boolean;
  skipped?: string;
  error?: string;
}

/**
 * Post a message to Slack via an incoming webhook. `blocks` is optional Block
 * Kit content; `text` is the fallback/notification text.
 */
export async function postToSlack(
  text: string,
  blocks?: unknown[],
): Promise<SlackResult> {
  const url = config.slackWebhookUrl;
  if (!url) return { sent: false, skipped: "SLACK_WEBHOOK_URL not set" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Slack ${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
