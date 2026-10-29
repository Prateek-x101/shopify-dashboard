import { db, messagesTable, ordersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { addOrderEvent } from "../lib/order-insights";

export type Intent = "complaint" | "cancel" | "confirm" | "query";

/**
 * Keyword classifier for customer messages (English + Hinglish). Cheap and
 * predictable; it only decides which badge to show and never answers anyone.
 */
const RULES: [Intent, RegExp][] = [
  [
    "complaint",
    /\b(complain\w*|damaged?|broken|defect\w*|torn|wrong (item|size|product|colou?r|order)|not received|didn'?t (get|receive)|never (got|received)|missing|fake|fraud|scam|cheat\w*|worst|pathetic|bad quality|poor quality|refund|return (it|this|karna|krna)|replace(ment)?|exchange|kharab|kharaab|galat|toota|tuta|phat[ae]|faat[ae]|nahi mila|nhi mila|nai mila|paisa wapas|consumer (court|forum)|legal action)\b/i,
  ],
  ["cancel", /\b(cancel\w*|don'?t want|do not want|nahi chahiye|nhi chahiye|mat bhejo|band karo order)\b/i],
  ["confirm", /^\s*(yes|yess+|yeah|yep|ok(ay)?|confirm(ed)?|haan?|ha|hn|ji|done|sure)\b[\s!.👍]*$/i],
  ["query", /\b(where is|kab aayega|kab ayega|kab tak|status|track(ing)?|delivery date|when will|kahan hai|kaha hai|update)\b/i],
];

export function classify(text: string): Intent | null {
  for (const [intent, re] of RULES) if (re.test(text)) return intent;
  return null;
}

/** Called for every inbound message after it is linked to an order. */
export async function applyIntent(messageId: number, orderId: number | null, text: string) {
  const intent = classify(text);
  if (!intent) return null;
  await db.update(messagesTable).set({ intent }).where(eq(messagesTable.id, messageId));
  if (orderId && intent === "complaint") {
    const [o] = await db.select({ status: ordersTable.complaintStatus }).from(ordersTable).where(eq(ordersTable.id, orderId));
    if (o?.status !== "open") {
      await db.update(ordersTable).set({ complaintStatus: "open", complaintAt: new Date() }).where(eq(ordersTable.id, orderId));
      await addOrderEvent(orderId, "complaint", "Complaint received", text.slice(0, 200));
    }
  }
  if (orderId && intent === "cancel") await addOrderEvent(orderId, "cancelled", "Customer asked to cancel", text.slice(0, 200));
  if (orderId && intent === "confirm") {
    await db.update(ordersTable).set({ confirmedAt: new Date() }).where(eq(ordersTable.id, orderId));
    await addOrderEvent(orderId, "payment", "Customer confirmed", text.slice(0, 200));
  }
  return intent;
}

/** One-time pass over messages received before the classifier existed. */
export async function backfillIntents() {
  const rows = await db
    .select({ id: messagesTable.id, orderId: messagesTable.orderId, body: messagesTable.body })
    .from(messagesTable)
    .where(and(eq(messagesTable.direction, "in"), isNull(messagesTable.intent)))
    .limit(2000);
  for (const r of rows) {
    const intent = classify(r.body);
    if (!intent) continue;
    await db.update(messagesTable).set({ intent }).where(eq(messagesTable.id, r.id));
    if (r.orderId && intent === "complaint") {
      await db.update(ordersTable).set({ complaintStatus: "open", complaintAt: new Date() }).where(and(eq(ordersTable.id, r.orderId), isNull(ordersTable.complaintStatus)));
    }
  }
}
