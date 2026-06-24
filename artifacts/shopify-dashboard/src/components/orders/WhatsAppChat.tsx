import { useState, useRef, useEffect } from "react";
import {
  X, Send, Phone, Video, MoreVertical, ArrowLeft,
  Check, CheckCheck, Loader2, WifiOff, Settings,
} from "lucide-react";
import {
  useGetWhatsappStatus, getGetWhatsappStatusQueryKey,
  useGetWhatsappMessages, getGetWhatsappMessagesQueryKey,
  useSendWhatsappMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface WhatsAppChatProps {
  customerName: string;
  customerPhone?: string | null;
  orderName: string;
  orderId: string;
}

// ── Tick icon ─────────────────────────────────────────────────────
function TickIcon({ status }: { status: string }) {
  if (status === "read")      return <CheckCheck className="w-3.5 h-3.5 text-blue-400 inline ml-1 shrink-0" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-gray-400 inline ml-1 shrink-0" />;
  if (status === "failed")    return <X className="w-3 h-3 text-red-400 inline ml-1 shrink-0" />;
  return <Check className="w-3.5 h-3.5 text-gray-400 inline ml-1 shrink-0" />;
}

// ── Format timestamp ───────────────────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Full chat modal ────────────────────────────────────────────────
function FullChatModal({
  customerName,
  customerPhone,
  orderName,
  orderId,
  onClose,
}: {
  customerName: string;
  customerPhone?: string | null;
  orderName: string;
  orderId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState("");
  const [optimisticMsgs, setOptimisticMsgs] = useState<Array<{ id: string; text: string; time: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useGetWhatsappStatus({
    query: { queryKey: getGetWhatsappStatusQueryKey(), refetchInterval: 8000 },
  });

  const { data: msgData, isLoading: isMsgLoading } = useGetWhatsappMessages(orderId, {
    query: {
      queryKey: getGetWhatsappMessagesQueryKey(orderId),
      refetchInterval: 5000,
      enabled: !!orderId,
    },
  });

  const sendMsg = useSendWhatsappMessage();

  const isConnected = status?.connected === true;
  const phone = customerPhone || "";
  const messages = msgData?.messages ?? [];

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, optimisticMsgs.length]);

  function handleSend() {
    if (!draft.trim() || !phone) return;
    const text = draft.trim();
    const tempId = `opt-${Date.now()}`;
    setDraft("");

    // Optimistic: show immediately
    setOptimisticMsgs((p) => [...p, { id: tempId, text, time: new Date().toISOString() }]);

    sendMsg.mutate(
      {
        data: {
          to_phone: phone,
          message: text,
          order_id: orderId,
          order_name: orderName,
          customer_name: customerName,
        },
      },
      {
        onSuccess: () => {
          setOptimisticMsgs((p) => p.filter((m) => m.id !== tempId));
          queryClient.invalidateQueries({ queryKey: getGetWhatsappMessagesQueryKey(orderId) });
        },
        onError: () => {
          setOptimisticMsgs((p) =>
            p.map((m) => (m.id === tempId ? { ...m, failed: true } as typeof m : m))
          );
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-[680px] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* WhatsApp Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#075E54] text-white shrink-0">
          <button onClick={onClose} className="hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-[#128c7e] flex items-center justify-center text-sm font-bold shrink-0">
            {customerName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{customerName}</div>
            <div className="text-xs text-green-200 truncate">
              {phone || `Order ${orderName}`}
            </div>
          </div>
          <div className="flex items-center gap-3 text-white/80">
            <button className="hover:text-white transition-colors"><Video className="w-5 h-5" /></button>
            <button className="hover:text-white transition-colors"><Phone className="w-5 h-5" /></button>
            <button className="hover:text-white transition-colors"><MoreVertical className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Not connected banner */}
        {!isConnected && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
            <div className="flex items-center gap-2 text-amber-700 text-xs">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              WhatsApp not connected — messages won't be sent
            </div>
            <button
              onClick={() => { onClose(); navigate("/settings"); }}
              className="text-[11px] font-medium text-amber-700 hover:underline flex items-center gap-1 shrink-0"
            >
              <Settings className="w-3 h-3" /> Connect
            </button>
          </div>
        )}

        {/* No phone banner */}
        {isConnected && !phone && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-700 text-xs shrink-0">
            No phone number on this order — cannot send message
          </div>
        )}

        {/* Chat area */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4"
          style={{ background: "#e5ddd5" }}
        >
          {isMsgLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 && optimisticMsgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <div className="text-2xl">💬</div>
              <div className="text-sm text-gray-600 font-medium">No messages yet</div>
              <div className="text-xs text-gray-400">
                {isConnected && phone
                  ? "Type a message below to start the conversation"
                  : isConnected
                  ? "Add a phone number to this order to send messages"
                  : "Connect WhatsApp in Settings first"}
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-3">
                <span className="text-xs text-gray-500 bg-white/80 rounded-full px-3 py-0.5 shadow-sm">
                  Order {orderName}
                </span>
              </div>

              {/* Real messages */}
              {messages.map((msg) => {
                const isMine = msg.from === "store";
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1.5`}>
                    <div className={`relative max-w-[80%] px-3 py-1.5 rounded-2xl text-sm shadow-sm ${
                      isMine
                        ? msg.status === "failed"
                          ? "bg-red-100 text-red-900 rounded-tr-sm"
                          : "bg-[#dcf8c6] text-gray-900 rounded-tr-sm"
                        : "bg-white text-gray-900 rounded-tl-sm border border-gray-100"
                    }`}>
                      <span className="leading-snug">{msg.message}</span>
                      <div className={`flex items-center gap-0.5 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtTime(msg.timestamp)}</span>
                        {isMine && <TickIcon status={msg.status} />}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Optimistic messages */}
              {optimisticMsgs.map((msg) => (
                <div key={msg.id} className="flex justify-end mb-1.5">
                  <div className="relative max-w-[80%] px-3 py-1.5 rounded-2xl text-sm shadow-sm bg-[#dcf8c6] text-gray-900 rounded-tr-sm opacity-70">
                    <span className="leading-snug">{msg.text}</span>
                    <div className="flex items-center gap-0.5 mt-0.5 justify-end">
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtTime(msg.time)}</span>
                      <Loader2 className="w-3 h-3 text-gray-400 animate-spin ml-1" />
                    </div>
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f0f0] shrink-0">
          <div className="flex-1 flex items-center bg-white rounded-full px-4 py-2 shadow-sm border border-gray-200">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !isConnected ? "Connect WhatsApp first…" :
                !phone ? "No phone number on order…" :
                "Type a message"
              }
              disabled={!isConnected || !phone}
              className="flex-1 outline-none text-sm text-gray-800 bg-transparent placeholder-gray-400 disabled:cursor-not-allowed"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!draft.trim() || !isConnected || !phone || sendMsg.isPending}
            className="w-10 h-10 rounded-full bg-[#075E54] flex items-center justify-center shadow-md hover:bg-[#128c7e] transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendMsg.isPending
              ? <Loader2 className="w-4 h-4 text-white animate-spin" />
              : <Send className="w-4 h-4 text-white translate-x-0.5" />}
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-center gap-1.5 text-center text-[10px] bg-[#f0f0f0] pb-2 text-gray-400">
          {isConnected
            ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Connected via WhatsApp Web</>
            : <><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" /> WhatsApp not connected</>}
        </div>
      </div>
    </div>
  );
}

// ── Compact preview card ───────────────────────────────────────────
export function WhatsAppChat({ customerName, customerPhone, orderName, orderId }: WhatsAppChatProps) {
  const [open, setOpen] = useState(false);

  const { data: status } = useGetWhatsappStatus({
    query: { queryKey: getGetWhatsappStatusQueryKey() },
  });

  const { data: msgData } = useGetWhatsappMessages(orderId, {
    query: {
      queryKey: getGetWhatsappMessagesQueryKey(orderId),
      enabled: !!orderId,
    },
  });

  const isConnected = status?.connected === true;
  const messages = msgData?.messages ?? [];
  const lastMsg = messages[messages.length - 1];
  const unread = 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="whatsapp-chat-preview"
        className="w-full text-left rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md transition-all overflow-hidden group"
      >
        {/* Green header strip */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#075E54]">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="text-xs font-semibold text-white">WhatsApp</span>
          {/* Connection status */}
          <div className="ml-auto flex items-center gap-1">
            {isConnected
              ? <span className="w-1.5 h-1.5 rounded-full bg-[#25d366]" />
              : <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />}
            {unread > 0 && (
              <span className="bg-[#25d366] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unread}
              </span>
            )}
          </div>
        </div>

        {/* Preview body */}
        <div className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-[#128c7e] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {customerName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-900 truncate">{customerName}</span>
                {lastMsg && (
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtTime(lastMsg.timestamp)}</span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
                {lastMsg ? (
                  <>
                    {lastMsg.from === "store" && <CheckCheck className="w-3 h-3 text-blue-400 shrink-0" />}
                    {lastMsg.message}
                  </>
                ) : (
                  <span className="italic text-gray-400">
                    {isConnected ? "No messages yet — tap to send" : "Connect WhatsApp to send messages"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-[#075E54] font-medium group-hover:underline">
            {isConnected ? "Open conversation →" : "⚠ Connect WhatsApp in Settings →"}
          </div>
        </div>
      </button>

      {open && (
        <FullChatModal
          customerName={customerName}
          customerPhone={customerPhone}
          orderName={orderName}
          orderId={orderId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
