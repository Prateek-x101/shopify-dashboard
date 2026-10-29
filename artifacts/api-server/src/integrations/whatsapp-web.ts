import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from "baileys";
import QRCode from "qrcode";
import { db, whatsappAccountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { DATA_DIR } from "../config";
import { logger } from "../lib/logger";
import type { OutgoingWa } from "./whatsapp-meta";

/**
 * "WhatsApp Web" accounts: a linked device on the user's own number, via
 * Baileys (WhatsApp's multi-device websocket protocol; no browser needed).
 * Credentials live in data/wa-sessions/acc-<id> so a QR scan survives restarts.
 */
type State = "disconnected" | "initializing" | "qr" | "connected";
interface Session {
  sock: WASocket;
  state: State;
  qr: string | null;
  phone: string | null;
  stopped: boolean;
}

const sessions = new Map<number, Session>();
const retryCount = new Map<number, number>();
export const waWebEvents = new EventEmitter();
// events: "message" ({accountId, from, name, text, id, timestamp}), "ack" ({id, status})

const baileysLogger = logger.child({ module: "baileys" }, { level: "error" });
const sessionDir = (accountId: number) => path.join(DATA_DIR, "wa-sessions", `acc-${accountId}`);

async function setStatus(accountId: number, status: string, extra: { phoneNumber?: string | null; lastError?: string | null } = {}) {
  await db.update(whatsappAccountsTable).set({ status, ...extra }).where(eq(whatsappAccountsTable.id, accountId));
}

export function webSessionInfo(accountId: number) {
  const s = sessions.get(accountId);
  return { state: s?.state ?? "disconnected", qr: s?.qr ?? null, phone: s?.phone ?? null };
}

/** Phone digits from a jid; v7 may address chats by LID, so prefer the phone-number alt jid. */
function phoneFromKey(key: WAMessage["key"]): string | null {
  const candidates = [key.remoteJid, (key as any).remoteJidAlt, (key as any).senderPn, (key as any).participantPn];
  const pn = candidates.find((j) => typeof j === "string" && j.endsWith("@s.whatsapp.net"));
  return pn ? pn.split("@")[0].split(":")[0] : null;
}

function textOf(m: WAMessage): string {
  const msg = m.message ?? {};
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.templateButtonReplyMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    (Object.keys(msg)[0] ? `[${Object.keys(msg)[0].replace(/Message$/, "")}]` : "")
  );
}

const ACK: Record<number, string> = { 2: "sent", 3: "delivered", 4: "read", 5: "read" };

export async function startWebSession(accountId: number) {
  const existing = sessions.get(accountId);
  if (existing && existing.state !== "disconnected") return webSessionInfo(accountId);

  fs.mkdirSync(sessionDir(accountId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(accountId));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.windows("Orders Dashboard"),
    logger: baileysLogger as any,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Only 1:1 customer chats matter; skipping status/groups/channels avoids decrypt noise and work
    shouldIgnoreJid: (jid) => !jid || jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@g.us") || jid.endsWith("@newsletter"),
  });
  const session: Session = { sock, state: "initializing", qr: null, phone: null, stopped: false };
  sessions.set(accountId, session);
  await setStatus(accountId, "initializing", { lastError: null });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    if (u.qr) {
      session.qr = await QRCode.toDataURL(u.qr, { width: 280, margin: 1 });
      session.state = "qr";
      await setStatus(accountId, "qr");
    }
    if (u.connection === "open") {
      session.state = "connected";
      session.qr = null;
      retryCount.delete(accountId);
      session.phone = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      await setStatus(accountId, "connected", { phoneNumber: session.phone, lastError: null });
      logger.info({ accountId, phone: session.phone }, "WhatsApp connected");
    }
    if (u.connection === "close") {
      const code = (u.lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
      session.state = "disconnected";
      sessions.delete(accountId);
      if (session.stopped) return;
      if (code === DisconnectReason.loggedOut) {
        fs.rmSync(sessionDir(accountId), { recursive: true, force: true });
        await setStatus(accountId, "disconnected", { lastError: "Logged out from the phone. Scan the QR again." });
        return;
      }
      if (!state.creds.registered && code !== DisconnectReason.restartRequired) {
        // QR was shown but never scanned
        await setStatus(accountId, "disconnected", { lastError: "QR expired. Click Connect to get a new one." });
        return;
      }
      // restartRequired (right after pairing), network drops, etc.: reconnect with backoff
      const n = (retryCount.get(accountId) ?? 0) + 1;
      retryCount.set(accountId, n);
      const wait = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** n);
      await setStatus(accountId, "initializing", { lastError: u.lastDisconnect?.error?.message ?? null });
      setTimeout(() => {
        if (sessions.has(accountId)) return;
        startWebSession(accountId).catch((err) => logger.error({ err: err.message }, "WA reconnect failed"));
      }, wait);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      if (m.key.fromMe || !m.message) continue;
      const jid = m.key.remoteJid ?? "";
      if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
      const from = phoneFromKey(m.key);
      if (!from) continue;
      waWebEvents.emit("message", {
        accountId,
        from,
        name: m.pushName ?? null,
        text: textOf(m),
        id: m.key.id ?? "",
        timestamp: new Date(Number(m.messageTimestamp ?? Date.now() / 1000) * 1000),
      });
    }
  });

  sock.ev.on("messages.update", (updates) => {
    for (const u of updates) {
      if (!u.key.fromMe) continue;
      const status = u.update.status != null ? ACK[u.update.status as number] : undefined;
      if (status && u.key.id) waWebEvents.emit("ack", { id: u.key.id, status });
    }
  });

  return webSessionInfo(accountId);
}

export async function stopWebSession(accountId: number, logout = false) {
  const s = sessions.get(accountId);
  sessions.delete(accountId);
  if (s) {
    s.stopped = true;
    try {
      if (logout) await s.sock.logout();
      else s.sock.end(undefined);
    } catch {
      /* ignore */
    }
  }
  if (logout) fs.rmSync(sessionDir(accountId), { recursive: true, force: true });
  await setStatus(accountId, "disconnected");
}

export async function sendWeb(accountId: number, msg: OutgoingWa): Promise<string> {
  const s = sessions.get(accountId);
  if (!s || s.state !== "connected") throw new Error("WhatsApp Web is not connected: scan the QR in Settings");
  const exists = (await s.sock.onWhatsApp(msg.to).catch(() => undefined))?.[0];
  if (exists && !exists.exists) throw new Error(`+${msg.to} is not on WhatsApp`);
  const jid = exists?.jid ?? `${msg.to}@s.whatsapp.net`;
  const text = msg.text ?? "";
  if (msg.imageUrl) {
    try {
      const sent = await s.sock.sendMessage(jid, { image: { url: msg.imageUrl }, caption: text });
      return sent?.key.id ?? "";
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "image send failed, sending text only");
    }
  }
  const sent = await s.sock.sendMessage(jid, { text });
  return sent?.key.id ?? "";
}

/** Re-open sessions that were linked before a restart. */
export async function resumeWebSessions() {
  const accounts = await db.select().from(whatsappAccountsTable).where(eq(whatsappAccountsTable.provider, "web"));
  for (const a of accounts) {
    if (fs.existsSync(path.join(sessionDir(a.id), "creds.json"))) {
      startWebSession(a.id).catch((err) => logger.warn({ err: err.message }, "WA resume failed"));
    } else if (a.status !== "disconnected") {
      await setStatus(a.id, "disconnected");
    }
  }
}
