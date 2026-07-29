import type { Contact, Suggestion } from "@prisma/client";
import { prisma } from "./db";
import { formatDate, relativeDays } from "./date";
import { cadenceLabel, dueInfo } from "./cadence";
import { getDueBuckets } from "./due";
import { postToSlack } from "./slack";

// The daily nudge: who's due for contact today (by their cadence or because
// you queued them), plus AI suggestions awaiting review. People with a booked
// meeting ("scheduled") are excluded automatically.

export interface NudgeData {
  generatedAt: Date;
  due: Contact[];
  suggestions: Suggestion[];
}

export async function buildNudgeData(now = new Date()): Promise<NudgeData> {
  const [buckets, suggestions] = await Promise.all([
    getDueBuckets(now),
    prisma.suggestion.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);
  return { generatedAt: now, due: buckets.due, suggestions };
}

export function isNudgeEmpty(data: NudgeData): boolean {
  return data.due.length === 0 && data.suggestions.length === 0;
}

function line(c: Contact): string {
  const who = c.company ? `${c.name} (${c.company})` : c.name;
  const d = dueInfo(c);
  const why =
    d.reason === "never"
      ? "not contacted yet"
      : d.reason === "queued"
        ? "queued"
        : `${cadenceLabel(c.cadenceDays).toLowerCase()}, last contact ${relativeDays(c.lastContactAt)}`;
  return `${who} — ${why}`;
}

function suggestionLine(s: Suggestion): string {
  return s.reason ? `${s.name} — ${s.reason}` : s.name;
}

export function formatNudgeText(data: NudgeData): string {
  const lines: string[] = [`Daily networking nudge — ${formatDate(data.generatedAt)}`, ""];
  lines.push(`🔔 Due for contact (${data.due.length})`);
  if (data.due.length === 0) lines.push("  • nobody — all caught up 🎉");
  for (const c of data.due) lines.push(`  • ${line(c)}`);
  if (data.suggestions.length > 0) {
    lines.push("");
    lines.push(`✨ From your notes — review on the dashboard (${data.suggestions.length})`);
    for (const s of data.suggestions) lines.push(`  • ${suggestionLine(s)}`);
  }
  return lines.join("\n");
}

function slackBlocks(data: NudgeData): unknown[] {
  const section = (title: string, body: string) => ({
    type: "section",
    text: { type: "mrkdwn", text: `*${title}*\n${body}` },
  });
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "🔔 Daily networking nudge", emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: formatDate(data.generatedAt) }] },
    { type: "divider" },
    section(
      `🔔 Due for contact (${data.due.length})`,
      data.due.length === 0 ? "_nobody — all caught up 🎉_" : data.due.map((c) => `• ${line(c)}`).join("\n"),
    ),
  ];
  if (data.suggestions.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push(
      section(
        `✨ From your notes (${data.suggestions.length}) — review on the dashboard`,
        data.suggestions.map((s) => `• ${suggestionLine(s)}`).join("\n"),
      ),
    );
  }
  return blocks;
}

export interface NudgeReport {
  data: NudgeData;
  empty: boolean;
  slack: Awaited<ReturnType<typeof postToSlack>>;
}

export async function runNudge(options: { force?: boolean } = {}): Promise<NudgeReport> {
  const data = await buildNudgeData();
  const empty = isNudgeEmpty(data);
  if (empty && !options.force) {
    return { data, empty, slack: { sent: false, skipped: "nudge empty" } };
  }
  const slack = await postToSlack(formatNudgeText(data), slackBlocks(data));
  return { data, empty, slack };
}
