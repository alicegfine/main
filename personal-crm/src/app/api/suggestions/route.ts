import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const suggestions = await prisma.suggestion.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ suggestions });
}
