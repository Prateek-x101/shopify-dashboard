import crypto from "crypto";
import type { WhatsappAccount } from "@workspace/db";

const GRAPH = "https://graph.facebook.com/v21.0";
type Json = Record<string, any>;

export interface OutgoingWa {
  to: string; // digits with country code
  text?: string;
  imageUrl?: string | null;
  template?: { name: string; language: string; params: string[]; headerImageUrl?: string | null };
}

async function graph(acc: WhatsappAccount, path: string, init: RequestInit = {}): Promise<Json> {
  if (!acc.metaAccessToken) throw new Error("Meta access token missing");
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${acc.metaAccessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new Error(`${e.message ?? `Meta HTTP ${res.status}`}${e.error_data?.details ? ` (${e.error_data.details})` : ""}`);
  }
  return body;
}

export async function testMeta(acc: WhatsappAccount) {
  const body = await graph(acc, `/${acc.metaPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
  return { phone: body.display_phone_number as string, name: body.verified_name as string, quality: body.quality_rating as string };
}

export async function listMetaTemplates(acc: WhatsappAccount) {
  if (!acc.metaWabaId) throw new Error("WhatsApp Business Account ID missing");
  const body = await graph(acc, `/${acc.metaWabaId}/message_templates?limit=200&fields=name,language,status,category,components`);
  return (body.data ?? []).map((t: Json) => {
    const bodyComp = (t.components ?? []).find((c: Json) => c.type === "BODY");
    const header = (t.components ?? []).find((c: Json) => c.type === "HEADER");
    const paramCount = new Set(String(bodyComp?.text ?? "").match(/\{\{\d+\}\}/g) ?? []).size;
    return {
      name: t.name as string,
      language: t.language as string,
      status: t.status as string,
      category: t.category as string,
      body: (bodyComp?.text as string) ?? "",
      headerFormat: (header?.format as string) ?? null,
      paramCount,
    };
  });
}

export async function sendMeta(acc: WhatsappAccount, msg: OutgoingWa): Promise<string> {
  let payload: Json;
  if (msg.template) {
    const components: Json[] = [];
    if (msg.template.headerImageUrl) {
      components.push({ type: "header", parameters: [{ type: "image", image: { link: msg.template.headerImageUrl } }] });
    }
    if (msg.template.params.length) {
      components.push({ type: "body", parameters: msg.template.params.map((p) => ({ type: "text", text: p || "-" })) });
    }
    payload = { type: "template", template: { name: msg.template.name, language: { code: msg.template.language }, components } };
  } else if (msg.imageUrl) {
    payload = { type: "image", image: { link: msg.imageUrl, caption: msg.text ?? "" } };
  } else {
    payload = { type: "text", text: { body: msg.text ?? "", preview_url: true } };
  }
  const body = await graph(acc, `/${acc.metaPhoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: msg.to, ...payload }),
  });
  return body.messages?.[0]?.id ?? "";
}

export function verifyMetaSignature(acc: WhatsappAccount, rawBody: Buffer | undefined, header: string | undefined) {
  if (!acc.metaAppSecret) return true; // optional
  if (!rawBody || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", acc.metaAppSecret).update(rawBody).digest("hex");
  return expected.length === header.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

export interface MetaInbound {
  from: string;
  name: string | null;
  id: string;
  text: string;
  timestamp: Date;
  contextId: string | null;
}
export interface MetaStatus {
  id: string;
  status: string;
  error: string | null;
}

export function parseMetaWebhook(body: Json): { messages: MetaInbound[]; statuses: MetaStatus[] } {
  const messages: MetaInbound[] = [];
  const statuses: MetaStatus[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const names = new Map<string, string>((v.contacts ?? []).map((c: Json) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages ?? []) {
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          m.image?.caption ??
          (m.type ? `[${m.type}]` : "");
        messages.push({
          from: m.from,
          name: names.get(m.from) ?? null,
          id: m.id,
          text,
          timestamp: new Date(Number(m.timestamp) * 1000),
          contextId: m.context?.id ?? null,
        });
      }
      for (const s of v.statuses ?? []) {
        statuses.push({ id: s.id, status: s.status, error: s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? null });
      }
    }
  }
  return { messages, statuses };
}
