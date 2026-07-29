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

    // A new interaction restarts the cadence loop: bump lastContactAt, clear
    // the "scheduled" snooze, and consume a queued follow-up date that's now met.
    if (!contact.lastContactAt || contact.lastContactAt < input.occurredAt) {
      await prisma.contact.update({
        where: { id: input.contactId },
        data: {
          lastContactAt: input.occurredAt,
          scheduled: false,
          snoozedUntil: null,
          ...(contact.nextFollowUpAt && contact.nextFollowUpAt <= input.occurredAt
            ? { nextFollowUpAt: null }
            : {}),
        },
      });
    }

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
