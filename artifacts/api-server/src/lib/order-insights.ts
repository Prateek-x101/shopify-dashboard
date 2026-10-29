import { db, orderEventsTable } from "@workspace/db";

type Json = Record<string, any>;

export async function addOrderEvent(orderId: number, type: string, title: string, detail?: string | null, author?: string | null) {
  await db.insert(orderEventsTable).values({ orderId, type, title, detail: detail ?? null, author: author ?? null });
}

export interface DeviceInfo {
  type: "Mobile" | "Tablet" | "Desktop";
  os: string | null;
  browser: string | null;
  model: string | null;
  inApp: string | null; // Facebook / Instagram in-app browser
}

/** Small user-agent parser: enough to answer "phone or desktop, which app, which OS". */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo | null {
  if (!ua) return null;
  const inApp = /Instagram/i.test(ua)
    ? "Instagram app"
    : /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)
      ? "Facebook app"
      : /WhatsApp/i.test(ua)
        ? "WhatsApp"
        : /Snapchat/i.test(ua)
          ? "Snapchat app"
          : null;
  let os: string | null = null;
  let model: string | null = null;
  const android = ua.match(/Android ([\d.]+)(?:; ([^;)]+?)(?: Build|\)))?/);
  const ios = ua.match(/(iPhone|iPad)[^)]*OS ([\d_]+)/);
  if (android) {
    os = `Android ${android[1]}`;
    model = android[2]?.trim() && !/^(K|wv|Linux)$/i.test(android[2].trim()) ? android[2].trim() : null;
  } else if (ios) {
    os = `iOS ${ios[2].replace(/_/g, ".")}`;
    model = ua.match(/FBDV\/([^;]+)/)?.[1] ?? ua.match(/\((iPhone[\d,]+)/)?.[1] ?? ios[1];
  } else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Safari/.test(ua)
            ? "Safari"
            : null;
  const type: DeviceInfo["type"] = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobi|iPhone|Android/i.test(ua) ? "Mobile" : "Desktop";
  return { type, os, browser, model, inApp };
}

const RECORDING_KEYS = /record|replay|clarity|session_url|hotjar|smartlook|logrocket/i;

/** Pull attribution, device and extra info out of a raw Shopify order. */
export function orderInsights(raw: Json | null | undefined) {
  const r = raw ?? {};
  const attrs: { name: string; value: string }[] = (r.note_attributes ?? []).map((a: Json) => ({ name: String(a.name), value: String(a.value ?? "") }));
  const get = (n: string) => attrs.find((a) => a.name.toLowerCase() === n)?.value || null;

  const landing = get("landing_page_url") ?? r.landing_site ?? null;
  let landingParams = new URLSearchParams();
  let landingPath: string | null = null;
  try {
    if (landing) {
      const u = new URL(landing, "https://store.local");
      landingParams = u.searchParams;
      landingPath = u.pathname;
    }
  } catch {
    /* ignore malformed */
  }
  // The landing URL keeps values the attributes truncate at "&" (e.g. "H&D")
  const pick = (k: string) => landingParams.get(k) || get(k);
  const utm = {
    source: pick("utm_source") ?? (landingParams.get("fbclid") ? "facebook" : null),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    content: pick("utm_content"),
    term: pick("utm_term"),
    campaignId: landingParams.get("campaign_id") ?? landingParams.get("utm_id"),
    adId: landingParams.get("ad_id"),
    adsetId: landingParams.get("adset_id"),
    fbclid: !!landingParams.get("fbclid"),
    gclid: !!landingParams.get("gclid"),
  };
  const hasUtm = Object.values(utm).some((v) => v);

  const ua = get("user_agent") ?? r.client_details?.user_agent ?? null;
  const recordingAttr = attrs.find((a) => RECORDING_KEYS.test(a.name) && /^https?:\/\//.test(a.value));
  const shown = new Set(["user_agent", "landing_page_url", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "shopifycarttoken", "ipv4_address", "additional_charge"]);
  const other = attrs.filter((a) => !shown.has(a.name.toLowerCase()) && a.value && a.value !== "0.0");

  return {
    utm: hasUtm ? utm : null,
    landingPage: landing,
    landingPath,
    referrer: r.referring_site || null,
    device: parseUserAgent(ua),
    userAgent: ua,
    ip: get("ipv4_address") ?? r.browser_ip ?? null,
    journey: typeof r.note === "string" && r.note.trim() ? r.note : null,
    recordingFromAttributes: recordingAttr?.value ?? null,
    otherAttributes: other,
    shippingMethod: (r.shipping_lines ?? []).map((s: Json) => s.title).filter(Boolean).join(", ") || null,
    orderStatusUrl: r.order_status_url ?? null,
    acceptsMarketing: r.buyer_accepts_marketing ?? null,
  };
}

/** Base timeline entries we can derive from the Shopify order itself (no history needed). */
export function derivedEvents(raw: Json | null | undefined, createdAt: Date) {
  const r = raw ?? {};
  const out: { type: string; title: string; detail: string | null; createdAt: Date }[] = [
    { type: "created", title: "Order placed", detail: r.source_name && !/^\d+$/.test(r.source_name) ? `via ${r.source_name}` : (r.payment_gateway_names ?? []).join(", ") || null, createdAt },
  ];
  for (const f of r.fulfillments ?? []) {
    out.push({
      type: "fulfillment",
      title: "Fulfilled in Shopify",
      detail: [f.tracking_company, f.tracking_number].filter(Boolean).join(" · ") || null,
      createdAt: new Date(f.created_at),
    });
  }
  for (const rf of r.refunds ?? []) {
    out.push({ type: "payment", title: "Refund issued", detail: rf.note ?? null, createdAt: new Date(rf.created_at) });
  }
  if (r.cancelled_at) out.push({ type: "cancelled", title: "Order cancelled", detail: r.cancel_reason ?? null, createdAt: new Date(r.cancelled_at) });
  return out;
}
