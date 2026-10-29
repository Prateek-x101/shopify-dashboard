/** Shiprocket / Fastrr write their RTO prediction into the order tags. */
export function rtoRisk(tags: string): "very-high" | "high" | "medium" | "low" | null {
  const t = tags.toLowerCase();
  const m = t.match(/rto_prediction_([a-z-]+)/);
  if (m) return m[1] as "high";
  const tokens = t.split(/,\s*/);
  for (const k of ["very-high", "high", "medium", "low"] as const) if (tokens.includes(k)) return k;
  return null;
}
