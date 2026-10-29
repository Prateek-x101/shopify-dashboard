import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, emailAccountsTable, type EmailAccount } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export const EMAIL_PRESETS: Record<string, { smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number }> = {
  gmail: { smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.gmail.com", imapPort: 993 },
  zoho: { smtpHost: "smtp.zoho.in", smtpPort: 465, smtpSecure: true, imapHost: "imap.zoho.in", imapPort: 993 },
  outlook: { smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, imapHost: "outlook.office365.com", imapPort: 993 },
  hostinger: { smtpHost: "smtp.hostinger.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.hostinger.com", imapPort: 993 },
};

function transport(acc: EmailAccount) {
  return nodemailer.createTransport({
    host: acc.smtpHost,
    port: acc.smtpPort,
    secure: acc.smtpSecure,
    auth: { user: acc.username, pass: acc.password },
  });
}

function imap(acc: EmailAccount) {
  return new ImapFlow({
    host: acc.imapHost!,
    port: acc.imapPort,
    secure: true,
    auth: { user: acc.username, pass: acc.password },
    logger: false,
  });
}

export async function testEmail(acc: EmailAccount) {
  await transport(acc).verify();
  if (acc.imapHost) {
    const client = imap(acc);
    await client.connect();
    await client.logout();
  }
  await db.update(emailAccountsTable).set({ status: "connected", lastError: null }).where(eq(emailAccountsTable.id, acc.id));
  return { smtp: true, imap: !!acc.imapHost };
}

export async function sendEmail(
  acc: EmailAccount,
  msg: { to: string; subject: string; text: string; html?: string; inReplyTo?: string | null },
) {
  const info = await transport(acc).sendMail({
    from: acc.fromName ? `"${acc.fromName}" <${acc.email}>` : acc.email,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html ?? msg.text.replace(/\n/g, "<br>"),
    ...(msg.inReplyTo ? { inReplyTo: msg.inReplyTo, references: [msg.inReplyTo] } : {}),
  });
  return info.messageId as string;
}

export interface InboundEmail {
  accountId: number;
  from: string;
  fromName: string | null;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo: string | null;
  date: Date;
}

/** Fetch new INBOX mail since the last seen UID (first run: last 3 days). */
export async function fetchNewEmails(acc: EmailAccount): Promise<InboundEmail[]> {
  if (!acc.imapHost) return [];
  const client = imap(acc);
  const out: InboundEmail[] = [];
  let maxUid = acc.imapLastUid ?? 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const range = acc.imapLastUid
        ? { uid: `${acc.imapLastUid + 1}:*` }
        : { since: new Date(Date.now() - 3 * 86400_000) };
      const uids = (await client.search(range, { uid: true })) || [];
      for (const uid of uids.slice(-200)) {
        if (uid <= (acc.imapLastUid ?? 0)) continue;
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.value?.[0];
        if (!from?.address || from.address.toLowerCase() === acc.email.toLowerCase()) {
          maxUid = Math.max(maxUid, uid);
          continue;
        }
        out.push({
          accountId: acc.id,
          from: from.address.toLowerCase(),
          fromName: from.name || null,
          subject: parsed.subject ?? "",
          text: stripQuoted(parsed.text ?? ""),
          messageId: parsed.messageId ?? `${acc.id}-${uid}`,
          inReplyTo: (parsed.inReplyTo as string) ?? null,
          date: parsed.date ?? new Date(),
        });
        maxUid = Math.max(maxUid, uid);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  if (maxUid !== (acc.imapLastUid ?? 0)) {
    await db.update(emailAccountsTable).set({ imapLastUid: maxUid, status: "connected", lastError: null }).where(eq(emailAccountsTable.id, acc.id));
  }
  return out;
}

/** Drop the quoted thread below a reply so the chat view stays readable. */
function stripQuoted(text: string) {
  const markers = [/^On .+ wrote:$/m, /^-{2,}\s*Original Message/m, /^From: .+$/m, /^>/m];
  let cut = text.length;
  for (const m of markers) {
    const idx = text.search(m);
    if (idx > 0 && idx < cut) cut = idx;
  }
  return text.slice(0, cut).trim();
}

export function logEmailError(acc: EmailAccount, err: unknown) {
  const message = (err as Error).message ?? String(err);
  logger.warn({ account: acc.email, err: message }, "email poll failed");
  return db.update(emailAccountsTable).set({ status: "error", lastError: message }).where(eq(emailAccountsTable.id, acc.id));
}
