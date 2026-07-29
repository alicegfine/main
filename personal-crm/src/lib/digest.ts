import type { Contact } from "@prisma/client";
import { formatDate, relativeDays } from "./date";
import { cadenceLabel, dueInfo } from "./cadence";
import { DueBuckets, getDueBuckets } from "./due";
import { postToSlack } from "./slack";

// Weekly Slack summary of the cadence loop: who's due, who's coming up,
// who's booked, and how many contacts aren't being tracked at all.

export type DigestData = DueBuckets;

export const buildDigestData = getDueBuckets;

export function isDigestEmpty(data: DigestData): boolean {
  return data.dueSoon.length === 0 && data.needsCadence.length === 0;
}

function line(c: Contact): string {
  const who = c.company ? `${c.name} (${c.company})` : c.name;
  const d = dueInfo(c);
  const cadence = cadenceLabel(c.cadenceDays).toLowerCase();
  if (d.due) {
    const overdue =
      d.reason === "never"
        ? "not contacted yet"
        : d.overdueDays <= 0
          ? "due today"
          : `${d.overdueDays}d overdue`;
    const how = d.reason === "queued" ? "queued" : cadence;
    return `${who} — ${overdue} · ${how} · last contact ${relativeDays(c.lastContactAt)}`;
  }
  return `${who} — due ${relativeDays(d.dueAt)} · ${cadence}`;
}

export function formatDigestText(data: DigestData): string {
  const lines: string[] = [`Weekly networking digest — ${formatDate(data.generatedAt)}`, ""];
  lines.push(`🔔 Due (now or this week) (${data.dueSoon.length})`);
  if (data.dueSoon.length === 0) lines.push("  • nobody — all caught up 🎉");
  for (const c of data.dueSoon) lines.push(`  • ${line(c)}`);
  lines.push("");
  if (data.needsCadence.length > 0) {
    lines.push(
      `🎯 Pick a cadence (you've now talked to them): ${data.needsCadence.map((c) => c.name).join(", ")}`,
    );
    lines.push("");
  }
  if (data.scheduled.length > 0) {
    lines.push(`📅 Scheduled (reminders paused): ${data.scheduled.map((c) => c.name).join(", ")}`);
    lines.push("");
  }
  if (data.noCadenceCount > 0) {
    lines.push(`💤 ${data.noCadenceCount} contact(s) have no cadence set — set one to get reminders.`);
  }
  return lines.join("\n").trimEnd();
}

export function formatDigestSlackBlocks(data: DigestData): unknown[] {
  const section = (title: string, body: string) => ({
    type: "section",
    text: { type: "mrkdwn", text: `*${title}*\n${body}` },
  });
  const body = (items: Contact[], empty: string) =>
    items.length === 0 ? `_${empty}_` : items.map((c) => `• ${line(c)}`).join("\n");

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "🤝 Weekly networking digest", emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: formatDate(data.generatedAt) }] },
    { type: "divider" },
    section(
      `🔔 Due — now or this week (${data.dueSoon.length})`,
      body(data.dueSoon, "nobody — all caught up 🎉"),
    ),
  ];
  const footer: string[] = [];
  if (data.needsCadence.length > 0) {
    footer.push(`🎯 Pick a cadence: ${data.needsCadence.map((c) => c.name).join(", ")}`);
  }
  if (data.scheduled.length > 0) {
    footer.push(`📅 Scheduled: ${data.scheduled.map((c) => c.name).join(", ")}`);
  }
  if (data.noCadenceCount > 0) {
    footer.push(`💤 ${data.noCadenceCount} contact(s) with no cadence set`);
  }
  if (footer.length > 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: footer.join("  ·  ") }] });
  }
  return blocks;
}

export interface DigestReport {
  data: DigestData;
  empty: boolean;
  slack: Awaited<ReturnType<typeof postToSlack>>;
}

export async function runDigest(options: { force?: boolean } = {}): Promise<DigestReport> {
  const data = await buildDigestData();
  const empty = isDigestEmpty(data);
  if (empty && !options.force) {
    return { data, empty, slack: { sent: false, skipped: "digest empty" } };
  }
  const slack = await postToSlack(formatDigestText(data), formatDigestSlackBlocks(data));
  return { data, empty, slack };
}
