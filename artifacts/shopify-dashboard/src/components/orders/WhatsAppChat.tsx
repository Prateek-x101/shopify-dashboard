import { useState } from "react";
import { X, Send, Phone, Video, MoreVertical, ArrowLeft, Check, CheckCheck } from "lucide-react";

interface Message {
  id: number;
  text: string;
  time: string;
  from: "customer" | "store";
  status: "sent" | "delivered" | "read";
}

interface WhatsAppChatProps {
  customerName: string;
  customerPhone?: string | null;
  orderName: string;
}

const DUMMY_MESSAGES: Message[] = [
  {
    id: 1,
    text: "Hi, I placed an order. When will it be delivered?",
    time: "10:02 AM",
    from: "customer",
    status: "read",
  },
  {
    id: 2,
    text: "Hello! Your order has been confirmed and will be dispatched within 24 hours.",
    time: "10:15 AM",
    from: "store",
    status: "read",
  },
  {
    id: 3,
    text: "Can I get an estimated delivery date?",
    time: "10:17 AM",
    from: "customer",
    status: "read",
  },
  {
    id: 4,
    text: "Sure! Expected delivery is within 5–7 business days. We'll send tracking details once shipped.",
    time: "10:21 AM",
    from: "store",
    status: "read",
  },
  {
    id: 5,
    text: "Okay, thank you!",
    time: "10:22 AM",
    from: "customer",
    status: "read",
  },
  {
    id: 6,
    text: "Your order has been shipped! Track here: https://track.delhivery.com/p/12345",
    time: "Yesterday 2:45 PM",
    from: "store",
    status: "delivered",
  },
];

function TickIcon({ status }: { status: Message["status"] }) {
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400 inline ml-1 shrink-0" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-gray-400 inline ml-1 shrink-0" />;
  return <Check className="w-3.5 h-3.5 text-gray-400 inline ml-1 shrink-0" />;
}

function ChatBubble({ msg }: { msg: Message }) {
  const isMine = msg.from === "store";
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1.5`}>
      <div
        className={`relative max-w-[80%] px-3 py-1.5 rounded-2xl text-sm shadow-sm ${
          isMine
            ? "bg-[#dcf8c6] text-gray-900 rounded-tr-sm"
            : "bg-white text-gray-900 rounded-tl-sm border border-gray-100"
        }`}
      >
        <span className="leading-snug">{msg.text}</span>
        <div className={`flex items-center gap-0.5 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{msg.time}</span>
          {isMine && <TickIcon status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

function FullChatModal({
  customerName,
  customerPhone,
  orderName,
  onClose,
}: {
  customerName: string;
  customerPhone?: string | null;
  orderName: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");

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
              {customerPhone || "Order " + orderName}
            </div>
          </div>
          <div className="flex items-center gap-3 text-white/80">
            <button className="hover:text-white transition-colors"><Video className="w-5 h-5" /></button>
            <button className="hover:text-white transition-colors"><Phone className="w-5 h-5" /></button>
            <button className="hover:text-white transition-colors"><MoreVertical className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Chat background */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
          style={{
            background: "url(\"data:image/svg+xml,%3Csvg width='300' height='300' viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='300' height='300' fill='%23e5ddd5'/%3E%3C/svg%3E\") #e5ddd5",
          }}
        >
          {/* Date separator */}
          <div className="flex justify-center mb-3">
            <span className="text-xs text-gray-500 bg-white/80 rounded-full px-3 py-0.5 shadow-sm">
              Today
            </span>
          </div>

          {DUMMY_MESSAGES.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}
        </div>

        {/* Input area */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f0f0] shrink-0">
          <div className="flex-1 flex items-center bg-white rounded-full px-4 py-2 shadow-sm border border-gray-200">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message"
              className="flex-1 outline-none text-sm text-gray-800 bg-transparent placeholder-gray-400"
            />
          </div>
          <button
            className="w-10 h-10 rounded-full bg-[#075E54] flex items-center justify-center shadow-md hover:bg-[#128c7e] transition-colors shrink-0"
          >
            <Send className="w-4 h-4 text-white translate-x-0.5" />
          </button>
        </div>

        {/* Integration note */}
        <div className="text-center text-[10px] text-gray-400 bg-[#f0f0f0] pb-2">
          WhatsApp Business API integration coming soon
        </div>
      </div>
    </div>
  );
}

export function WhatsAppChat({ customerName, customerPhone, orderName }: WhatsAppChatProps) {
  const [open, setOpen] = useState(false);
  const lastMsg = DUMMY_MESSAGES[DUMMY_MESSAGES.length - 1];
  const unread = 0;

  return (
    <>
      {/* Compact preview card */}
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
          {unread > 0 && (
            <span className="ml-auto bg-[#25d366] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unread}
            </span>
          )}
        </div>

        {/* Last message preview */}
        <div className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-[#128c7e] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {customerName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-900 truncate">{customerName}</span>
                <span className="text-[10px] text-gray-400 shrink-0">{lastMsg.time}</span>
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
                {lastMsg.from === "store" && <CheckCheck className="w-3 h-3 text-blue-400 shrink-0" />}
                {lastMsg.text}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-[#075E54] font-medium group-hover:underline">
            Open conversation →
          </div>
        </div>
      </button>

      {/* Full chat modal */}
      {open && (
        <FullChatModal
          customerName={customerName}
          customerPhone={customerPhone}
          orderName={orderName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
