import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type MailAttachment = { filename: string; content: Uint8Array; contentType: string };
export type Mail = { to: string; subject: string; text: string; html: string; attachments?: MailAttachment[] };

function settings() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? "465");
  return { host, port, user, pass, from: process.env.MAIL_FROM || user };
}

export function mailConfigured() {
  return settings() !== null;
}

// Se reutiliza entre invocaciones de la misma instancia del servidor.
let transporter: Transporter | null = null;

export async function sendMail(mail: Mail) {
  const config = settings();
  if (!config) {
    console.warn("Correo saliente sin configurar: definí SMTP_HOST, SMTP_USER y SMTP_PASS.");
    return false;
  }
  transporter ??= nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  await transporter.sendMail({
    from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html,
    attachments: mail.attachments?.map((file) => ({ filename: file.filename, content: Buffer.from(file.content), contentType: file.contentType })),
  });
  return true;
}
