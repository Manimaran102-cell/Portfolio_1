import nodemailer, { Transporter } from "nodemailer";
import config from "../config/index.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.smtpEnabled) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    // fail fast instead of holding the visitor's request open
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Visitor text goes into an HTML email, so escape it first. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Header values must not contain newlines, otherwise a crafted "name" could
 * inject extra headers into the notification email.
 */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "").trim();
}

export interface MailResult {
  sent: boolean;
  skipped: boolean;
  error?: string;
}

export interface MessageForMail {
  name: string;
  email: string;
  topic: string;
  company: string;
  message: string;
  source: string;
}

export async function sendNotification(msg: MessageForMail): Promise<MailResult> {
  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, skipped: true };
  }

  const replyTo = sanitizeHeader(msg.email) || undefined;

  try {
    await mailer.sendMail({
      from: config.smtp.from,
      to: config.smtp.to,
      // fixed subject: visitor input must not reach a header unfiltered
      subject: `Portfolio: ${sanitizeHeader(msg.topic)} from ${sanitizeHeader(msg.name)}`,
      replyTo,
      text: [
        `Name: ${msg.name}`,
        `Email: ${msg.email}`,
        `Topic: ${msg.topic}`,
        msg.company ? `Company: ${msg.company}` : null,
        msg.source ? `Sent from: ${msg.source}` : null,
        "",
        msg.message,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0e18;color:#eef1f8;padding:24px;border-radius:12px">
          <p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#00e5c0">New portfolio message</p>
          <table style="font-size:14px;border-collapse:collapse;width:100%">
            <tr><td style="padding:6px 12px 6px 0;color:#8b93a7;white-space:nowrap">Name</td><td style="padding:6px 0">${escapeHtml(msg.name)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8b93a7">Email</td><td style="padding:6px 0">${escapeHtml(msg.email)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8b93a7">Topic</td><td style="padding:6px 0">${escapeHtml(msg.topic)}</td></tr>
            ${msg.company ? `<tr><td style="padding:6px 12px 6px 0;color:#8b93a7">Company</td><td style="padding:6px 0">${escapeHtml(msg.company)}</td></tr>` : ""}
            ${msg.source ? `<tr><td style="padding:6px 12px 6px 0;color:#8b93a7">Sent from</td><td style="padding:6px 0">${escapeHtml(msg.source)}</td></tr>` : ""}
          </table>
          <p style="margin:20px 0 6px;font-size:13px;color:#8b93a7">Message</p>
          <p style="margin:0;white-space:pre-wrap;line-height:1.6">${escapeHtml(msg.message)}</p>
        </div>
      `.trim(),
    });
    return { sent: true, skipped: false };
  } catch (error) {
    const reason = (error as Error).message;
    console.error("Notification email failed:", reason);
    return { sent: false, skipped: false, error: reason };
  }
}
