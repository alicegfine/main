import type { Contact, Suggestion } from "@prisma/client";
import { prisma } from "./db";
import { formatDate, relativeDays } from "./date";
import { postToSlack } from "./slack";

export interface NudgeData {
  generatedAt: Date;
  toReachOut: Contact[];
  awaitingLinkedIn: Contact[];
  suggestions: Suggestion[];
}

/**
 * The daily "go check LinkedIn" nudge:
 *  - to reach out: people you've queued but not yet contacted,
 *  - awaiting LinkedIn: people you reached out to on LinkedIn (have a LinkedIn
 *    URL or a logged LinkedIn interaction) and are still waiting on,
 *  - suggestions: people the AI pulled from your notes, pending review.
 * Coworkers and archived contacts are excluded.
 */
export async function buildNudgeData(now = new Date()): Promise<NudgeData> {
  const active = { isCoworker: false, archivedAt: null } as const;

  const [toReachOut, awaitingLinkedIn, suggestions] = await Promise.all([
    prisma.contact.findMany({
      where: { ...active, status: "to_reach_out" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contact.findMany({
      where: {
        ...active,
        status: { in: ["reached_out", "pending_reply"] },
        OR: [
          { linkedinUrl: { not: null } },
          { interactions: { some: { channel: "linkedin" } } },
        ],
      },
      orderBy: { lastContactAt: "asc" },
      take: 30,
    }),
    prisma.suggestion.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return { generatedAt: now, toReachOut, awaitingLinkedIn, suggestions };
}

export function isNudgeEmpty(data: NudgeData): boolean {
  return (
    data.toReachOut.length === 0 &&
    data.awaitingLinkedIn.length === 0 &&
    data.suggestions.length === 0
  );
}

function line(c: Contact): string {
  const who = c.company ? `${c.name} (${c.company})` : c.name;
  const when = c.lastContactAt ? ` — reached out ${relativeDays(c.lastContactAt)}` : "";
  return `${who}${when}`;
}

function suggestionLine(s: Suggestion): string {
  return s.reason ? `${s.name} — ${s.reason}` : s.name;
}

export function formatNudgeText(data: NudgeData): string {
  const lines: string[] = [`Daily networking nudge — ${formatDate(data.generatedAt)}`, ""];
  lines.push(`📇 To reach out (${data.toReachOut.length})`);
  if (data.toReachOut.length === 0) lines.push("  • nobody queued");
  for (const c of data.toReachOut) lines.push(`  • ${line(c)}`);
  lines.push("");
  lines.push(`🔗 Check LinkedIn for replies (${data.awaitingLinkedIn.length})`);
  if (data.awaitingLinkedIn.length === 0) lines.push("  • nobody pending");
  for (const c of data.awaitingLinkedIn) lines.push(`  • ${line(c)}`);
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
  const contactBody = (items: Contact[], empty: string) =>
    items.length === 0 ? `_${empty}_` : items.map((c) => `• ${line(c)}`).join("\n");

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "🔔 Daily networking nudge", emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: formatDate(data.generatedAt) }] },
    { type: "divider" },
    section(`📇 To reach out (${data.toReachOut.length})`, contactBody(data.toReachOut, "nobody queued")),
    { type: "divider" },
    section(
      `🔗 Check LinkedIn for replies (${data.awaitingLinkedIn.length})`,
      contactBody(data.awaitingLinkedIn, "nobody pending"),
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
