import nodemailer from "nodemailer";
import { config } from "./env";

export interface EmailResult {
  sent: boolean;
  skipped?: string;
  error?: string;
}

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  const { host, port, secure, user, pass } = config.email;
  if (!host) return null;
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cachedTransport;
}

export async function sendEmail(
  subject: string,
  html: string,
  text: string,
): Promise<EmailResult> {
  const transport = getTransport();
  if (!transport) return { sent: false, skipped: "SMTP_HOST not set" };

  const from = config.email.from ?? config.email.user;
  const to = config.email.to;
  if (!from || !to) {
    return { sent: false, skipped: "DIGEST_EMAIL_FROM / DIGEST_EMAIL_TO not set" };
  }

  try {
    await transport.sendMail({ from, to, subject, html, text });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
