import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getSetting, setSetting } from "./settings";

/**
 * Single dashboard password. Needed because webhooks require exposing the
 * server through a public tunnel, which would otherwise expose every token.
 */
const COOKIE = "dash_session";
const SESSION_DAYS = 30;

interface AuthState {
  passwordHash: string;
  salt: string;
  sessionSecret: string;
}

function hash(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function getAuth(): Promise<AuthState | null> {
  return getSetting<AuthState | null>("auth", null);
}

export async function isPasswordSet() {
  return !!(await getAuth());
}

export async function setPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const existing = await getAuth();
  await setSetting("auth", {
    passwordHash: hash(password, salt),
    salt,
    sessionSecret: existing?.sessionSecret ?? crypto.randomBytes(32).toString("hex"),
  });
}

export async function verifyPassword(password: string) {
  const a = await getAuth();
  if (!a) return false;
  const h = Buffer.from(hash(password, a.salt), "hex");
  const stored = Buffer.from(a.passwordHash, "hex");
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function issueSession(res: Response) {
  const a = await getAuth();
  if (!a) throw new Error("Password not set");
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = String(exp);
  res.cookie(COOKIE, `${payload}.${sign(payload, a.sessionSecret)}`, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 86400_000,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

export async function hasValidSession(req: Request) {
  const a = await getAuth();
  if (!a) return false;
  const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE];
  if (!raw) return false;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload, a.sessionSecret);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  return Number(payload) > Date.now();
}

/** Guards /api except auth + webhook endpoints. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/auth/") || req.path.startsWith("/webhooks/") || req.path === "/healthz") {
    next();
    return;
  }
  if (await hasValidSession(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
}

/** Per-endpoint key appended to webhook URLs for providers that do not sign requests. */
let webhookSecretPromise: Promise<string> | null = null;

function webhookSecret() {
  // Memoised so parallel callers never generate two different secrets
  webhookSecretPromise ??= (async () => {
    let secret = await getSetting<string | null>("webhookSecret", null);
    if (!secret) {
      secret = crypto.randomBytes(24).toString("hex");
      await setSetting("webhookSecret", secret);
    }
    return secret;
  })().catch((err) => {
    webhookSecretPromise = null;
    throw err;
  });
  return webhookSecretPromise;
}

export async function webhookKey(scope: string) {
  return crypto.createHmac("sha256", await webhookSecret()).update(scope).digest("hex").slice(0, 24);
}
