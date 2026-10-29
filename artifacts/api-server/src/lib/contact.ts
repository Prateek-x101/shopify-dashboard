import type { PostalAddress } from "@workspace/db";

/** Normalise an Indian-first phone number to digits with country code, e.g. 919876543210 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 10) return null;
  return digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** Same checks the Google Sheet flow used: catch addresses couriers will reject. */
export function checkAddress(addr: PostalAddress | null | undefined): string | null {
  if (!addr) return "Missing address";
  const line = [addr.address1, addr.address2].filter(Boolean).join(" ").trim();
  if (!line) return "Missing address";
  if (line.length < 15) return `Short address (${line.length} chars)`;
  if (!/\d/.test(line) && line.length < 25) return "No house / flat number";
  const zip = String(addr.zip ?? "").replace(/\s/g, "");
  if (!/^[1-9]\d{5}$/.test(zip)) return "Invalid pincode";
  if (!addr.city) return "Missing city";
  return null;
}

export function fillTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? m : String(v);
  });
}
