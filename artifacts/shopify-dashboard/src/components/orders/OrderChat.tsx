import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";
import { ChatPopup } from "@/components/chat/ChatPopup";

/** Chat popup for any order, opened straight from a list row. */
export function OrderChat({ target, onClose }: { target: { id: number; channel: "whatsapp" | "email"; n: number } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const queryKey = ["order", target?.id];
  const { data: o } = useQuery({
    queryKey,
    queryFn: () => api<OrderDetail>(`/orders/${target!.id}`),
    enabled: !!target,
    refetchInterval: 15_000,
  });
  if (!target || !o || o.id !== target.id) return null;
  const first = o.lineItems[0];
  return (
    <ChatPopup
      key={`${o.id}-${target.n}`}
      hideLauncher
      openSignal={{ n: 1, channel: target.channel }}
      onClose={() => {
        qc.invalidateQueries({ queryKey: ["orders"] });
        onClose();
      }}
      subtitle={o.name}
      messages={o.messages}
      phone={o.phone}
      email={o.email}
      name={o.customerName}
      storeId={o.storeId}
      orderId={o.id}
      queryKey={queryKey}
      defaultSubject={`Your order ${o.name}`}
      vars={{
        name: o.customerName ?? "",
        first_name: (o.customerName ?? "").split(" ")[0],
        order: o.name,
        total: money(o.totalPrice),
        product: first ? [first.title, first.variantTitle].filter(Boolean).join(" - ") : "",
        awb: o.awb ?? "",
        courier: o.courier ?? "",
        tracking_url: o.awb ? `https://shiprocket.co/tracking/${o.awb}` : "",
        store: o.store?.name ?? "",
        image: first?.imageUrl ?? "",
      }}
    />
  );
}
