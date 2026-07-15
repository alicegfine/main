import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

async function main() {
  const existing = await prisma.contact.count();
  if (existing > 0) {
    console.log(`Skipping seed — ${existing} contacts already exist.`);
    return;
  }

  const jordan = await prisma.contact.create({
    data: {
      name: "Jordan Alvarez",
      email: "jordan@examplebio.org",
      company: "Example Bio",
      role: "Program Officer",
      linkedinUrl: "https://linkedin.com/in/example-jordan",
      howMet: "Intro from a mutual contact at a biosecurity summit",
      tags: "funder, biosecurity, warm intro",
      status: "pending_reply",
      notes: "Interested in the pandemic preparedness work. Wants a one-pager.",
      lastContactAt: new Date(now - 9 * DAY),
    },
  });

  const priya = await prisma.contact.create({
    data: {
      name: "Priya Nair",
      company: "Global Health Fund",
      role: "Partnerships Lead",
      tags: "funder, follow-up",
      status: "connected",
      nextFollowUpAt: new Date(now - 2 * DAY), // overdue
      lastContactAt: new Date(now - 14 * DAY),
    },
  });

  await prisma.contact.create({
    data: {
      name: "Sam Okafor",
      company: "Policy Lab",
      role: "Director",
      tags: "policy",
      status: "replied",
      lastContactAt: new Date(now - 40 * DAY), // going cold
    },
  });

  await prisma.interaction.create({
    data: {
      contactId: jordan.id,
      channel: "linkedin",
      summary: "Sent a connection note referencing their talk on metagenomic surveillance.",
      occurredAt: new Date(now - 9 * DAY),
    },
  });
  await prisma.interaction.create({
    data: {
      contactId: priya.id,
      channel: "meeting",
      summary: "Coffee chat — she suggested reconnecting after their Q3 planning.",
      occurredAt: new Date(now - 14 * DAY),
    },
  });

  console.log("Seeded 3 contacts and 2 interactions.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
