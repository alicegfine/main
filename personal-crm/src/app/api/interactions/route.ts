import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseInteraction, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const input = parseInteraction(body);

    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, lastContactAt: true, nextFollowUpAt: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const interaction = await prisma.interaction.create({
      data: {
        contactId: input.contactId,
        channel: input.channel,
        summary: input.summary ?? undefined,
        occurredAt: input.occurredAt,
      },
    });

    // A logged interaction restarts the cadence loop: clear the scheduled flag
    // and any snooze, drop a queued "reach out now" date (it's been handled —
    // even if the conversation is backdated), and bump lastContactAt when this
    // is the newest contact we know about.
    const now = new Date();
    await prisma.contact.update({
      where: { id: input.contactId },
      data: {
        scheduled: false,
        snoozedUntil: null,
        ...(contact.nextFollowUpAt && contact.nextFollowUpAt <= now
          ? { nextFollowUpAt: null }
          : {}),
        ...(!contact.lastContactAt || contact.lastContactAt < input.occurredAt
          ? { lastContactAt: input.occurredAt }
          : {}),
      },
    });

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
