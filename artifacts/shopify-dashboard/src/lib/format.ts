const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function money(amount: string | number | null | undefined) {
  const v = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  return inr.format(Number.isFinite(v) ? v : 0);
}

export function dateShort(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (date.toDateString() === yest.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ` ${time}`;
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ago(d: string | Date | null | undefined) {
  if (!d) return "";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** 919876543210 → +91 98765 43210 */
export function phone(p: string | null | undefined) {
  if (!p) return "";
  if (p.length === 12 && p.startsWith("91")) return `+91 ${p.slice(2, 7)} ${p.slice(7)}`;
  return `+${p}`;
}

export function initials(name: string | null | undefined) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
