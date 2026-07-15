import type { Contact } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./env";
import { daysAgo, formatDate, relativeDays } from "./date";
import { sendEmail } from "./email";
import { postToSlack } from "./slack";

export interface DigestData {
  generatedAt: Date;
  pendingReplies: Contact[];
  overdueFollowUps: Contact[];
  goingCold: Contact[];
}

/**
 * The three buckets that matter for networking follow-through:
 *  - pending replies: you're waiting to hear back,
 *  - overdue follow-ups: a next-action date that has passed,
 *  - going cold: warm contacts you haven't touched in COLD_AFTER_DAYS.
 */
export async function buildDigestData(now = new Date()): Promise<DigestData> {
  const coldCutoff = daysAgo(config.coldAfterDays, now);

  const [pendingReplies, overdueFollowUps, goingCold] = await Promise.all([
    prisma.contact.findMany({
      where: { status: "pending_reply" },
      orderBy: { lastContactAt: "asc" },
    }),
    prisma.contact.findMany({
      where: { nextFollowUpAt: { not: null, lte: now } },
      orderBy: { nextFollowUpAt: "asc" },
    }),
    prisma.contact.findMany({
      where: {
        status: { in: ["reached_out", "connected", "replied"] },
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: coldCutoff } }],
        // Don't nag about people with an upcoming scheduled follow-up.
        AND: [{ OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lte: now } }] }],
      },
      orderBy: { lastContactAt: "asc" },
      take: 25,
    }),
  ]);

  // A contact overdue for follow-up shouldn't also appear in "going cold".
  const overdueIds = new Set(overdueFollowUps.map((c) => c.id));
  const pendingIds = new Set(pendingReplies.map((c) => c.id));
  const filteredCold = goingCold.filter(
    (c) => !overdueIds.has(c.id) && !pendingIds.has(c.id),
  );

  return {
    generatedAt: now,
    pendingReplies,
    overdueFollowUps,
    goingCold: filteredCold,
  };
}

export function isDigestEmpty(data: DigestData): boolean {
  return (
    data.pendingReplies.length === 0 &&
    data.overdueFollowUps.length === 0 &&
    data.goingCold.length === 0
  );
}

// ---- Formatting ----------------------------------------------------------

function lineFor(c: Contact, kind: "pending" | "overdue" | "cold"): string {
  const who = c.company ? `${c.name} (${c.company})` : c.name;
  if (kind === "overdue") return `${who} — follow up (due ${relativeDays(c.nextFollowUpAt)})`;
  if (kind === "pending") return `${who} — last contact ${relativeDays(c.lastContactAt)}`;
  return `${who} — last contact ${relativeDays(c.lastContactAt)}`;
}

export function formatDigestText(data: DigestData): string {
  const lines: string[] = [`Networking digest — ${formatDate(data.generatedAt)}`, ""];
  const section = (title: string, items: Contact[], kind: "pending" | "overdue" | "cold") => {
    lines.push(`${title} (${items.length})`);
    if (items.length === 0) lines.push("  • none 🎉");
    for (const c of items) lines.push(`  • ${lineFor(c, kind)}`);
    lines.push("");
  };
  section("⏳ Pending replies", data.pendingReplies, "pending");
  section("🔔 Overdue follow-ups", data.overdueFollowUps, "overdue");
  section("🥶 Going cold", data.goingCold, "cold");
  return lines.join("\n");
}

export function formatDigestHtml(data: DigestData): string {
  const section = (title: string, items: Contact[], kind: "pending" | "overdue" | "cold") => {
    const rows =
      items.length === 0
        ? `<li style="color:#64748b">none 🎉</li>`
        : items.map((c) => `<li>${escapeHtml(lineFor(c, kind))}</li>`).join("");
    return `<h3 style="margin:16px 0 4px">${title} (${items.length})</h3><ul style="margin:0;padding-left:20px;line-height:1.6">${rows}</ul>`;
  };
  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:560px">
    <h2 style="margin:0 0 4px">Networking digest</h2>
    <p style="margin:0;color:#64748b">${formatDate(data.generatedAt)}</p>
    ${section("⏳ Pending replies", data.pendingReplies, "pending")}
    ${section("🔔 Overdue follow-ups", data.overdueFollowUps, "overdue")}
    ${section("🥶 Going cold", data.goingCold, "cold")}
  </div>`;
}

export function formatDigestSlackBlocks(data: DigestData): unknown[] {
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🤝 Networking digest", emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: formatDate(data.generatedAt) }],
    },
  ];
  const section = (title: string, items: Contact[], kind: "pending" | "overdue" | "cold") => {
    const body =
      items.length === 0
        ? "_none 🎉_"
        : items.map((c) => `• ${lineFor(c, kind)}`).join("\n");
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${title}* (${items.length})\n${body}` },
    });
  };
  section("⏳ Pending replies", data.pendingReplies, "pending");
  section("🔔 Overdue follow-ups", data.overdueFollowUps, "overdue");
  section("🥶 Going cold", data.goingCold, "cold");
  return blocks;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- Send ----------------------------------------------------------------

export interface DigestReport {
  data: DigestData;
  empty: boolean;
  slack: Awaited<ReturnType<typeof postToSlack>>;
  email: Awaited<ReturnType<typeof sendEmail>>;
}

export async function runDigest(options: { force?: boolean } = {}): Promise<DigestReport> {
  const data = await buildDigestData();
  const empty = isDigestEmpty(data);

  // Don't spam an empty digest unless explicitly forced (e.g. manual test).
  if (empty && !options.force) {
    return {
      data,
      empty,
      slack: { sent: false, skipped: "digest empty" },
      email: { sent: false, skipped: "digest empty" },
    };
  }

  const text = formatDigestText(data);
  const [slack, email] = await Promise.all([
    postToSlack(text, formatDigestSlackBlocks(data)),
    sendEmail(`Networking digest — ${formatDate(data.generatedAt)}`, formatDigestHtml(data), text),
  ]);

  return { data, empty, slack, email };
}
