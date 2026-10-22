/**
 * Outbound mail — SMTP when configured; otherwise log in non-production.
 * Never put reset tokens in audit logs.
 */
import { CLIENT_ORIGIN, IS_PRODUCTION } from "./config";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function smtpConfigured(): boolean {
  return !!(
    process.env.SMTP_URL?.trim() ||
    (process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim())
  );
}

export function mailEnabled(): boolean {
  return smtpConfigured() || !IS_PRODUCTION;
}

async function sendViaSmtp(msg: MailMessage): Promise<void> {
  // Dynamic import so local installs without nodemailer still typecheck if missing;
  // package is declared in package.json.
  const nodemailer = await import("nodemailer");
  const url = process.env.SMTP_URL?.trim();
  const transporter = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              }
            : undefined,
      });
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    "noreply@placement.local";
  await transporter.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html ?? msg.text.replace(/\n/g, "<br/>"),
  });
}

export async function sendMail(msg: MailMessage): Promise<{ sent: boolean; mode: string }> {
  if (smtpConfigured()) {
    await sendViaSmtp(msg);
    return { sent: true, mode: "smtp" };
  }
  if (IS_PRODUCTION) {
    console.error(
      "[mail] SMTP not configured — cannot send email in production. Set SMTP_URL or SMTP_HOST + SMTP_FROM."
    );
    return { sent: false, mode: "unconfigured" };
  }
  console.log(
    `\n[mail:dev] To: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}\n`
  );
  return { sent: true, mode: "console" };
}

export function passwordResetLink(rawToken: string): string {
  const base = CLIENT_ORIGIN.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  rawToken: string;
  expiresMinutes: number;
}): Promise<{ sent: boolean; mode: string }> {
  const link = passwordResetLink(params.rawToken);
  return sendMail({
    to: params.to,
    subject: "Reset your placement portal password",
    text: [
      `Hi ${params.name},`,
      "",
      "We received a request to reset your password.",
      `This link expires in ${params.expiresMinutes} minutes:`,
      link,
      "",
      "If you did not request this, you can ignore this email.",
      "",
      "— Placement Portal",
    ].join("\n"),
  });
}
