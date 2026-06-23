import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PaymentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  
  const s = status.toLowerCase();
  let dotColor = "";
  let classes = "";
  let label = status;

  if (s === "paid") {
    classes = "bg-gray-100/80 text-gray-800 border-gray-200 shadow-sm";
    dotColor = "bg-gray-600";
    label = "Paid";
  } else if (s === "pending" || s === "payment pending" || s === "payment_pending") {
    classes = "bg-amber-50 text-amber-900 border-amber-200 shadow-sm";
    dotColor = "bg-amber-500";
    label = "Payment pending";
  } else if (s === "partially_paid" || s === "partially paid") {
    classes = "bg-purple-50 text-purple-900 border-purple-200 shadow-sm";
    dotColor = "bg-purple-500";
    label = "Partially paid";
  } else {
    classes = "bg-gray-50 text-gray-700 border-gray-200 shadow-sm";
    dotColor = "bg-gray-400";
  }

  return (
    <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5", classes)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
      {label}
    </Badge>
  );
}

export function FulfillmentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;

  const s = status.toLowerCase();
  let dotColor = "";
  let classes = "";
  let label = status;

  if (s === "fulfilled") {
    classes = "bg-[#e2f1ea] text-[#00604b] border-[#bedbd0] shadow-sm";
    dotColor = "bg-[#008060]";
    label = "Fulfilled";
  } else if (s === "unfulfilled") {
    classes = "bg-amber-50 text-amber-900 border-amber-200 shadow-sm";
    dotColor = "bg-amber-500";
    label = "Unfulfilled";
  } else if (s === "partial" || s === "partially fulfilled" || s === "partially_fulfilled") {
    classes = "bg-blue-50 text-blue-900 border-blue-200 shadow-sm";
    dotColor = "bg-blue-500";
    label = "Partially fulfilled";
  } else {
    classes = "bg-gray-50 text-gray-700 border-gray-200 shadow-sm";
    dotColor = "bg-gray-400";
  }

  return (
    <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5", classes)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
      {label}
    </Badge>
  );
}
