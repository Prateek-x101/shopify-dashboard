import { useState, useRef, useEffect } from "react";
import {
  X, Send, Mail, ArrowLeft, Loader2, Settings, AlertCircle, Calendar
} from "lucide-react";
import {
  useGetSettings, getGetSettingsQueryKey,
  useGetEmailMessages, getGetEmailMessagesQueryKey,
  useSendEmail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface EmailChatProps {
  customerName: string;
  customerEmail?: string | null;
  orderName: string;
  orderId: string;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// ── Full email modal ────────────────────────────────────────────────
function FullEmailModal({
  customerName,
  customerEmail,
  orderName,
  orderId,
  onClose,
}: {
  customerName: string;
  customerEmail?: string | null;
  orderName: string;
  orderId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [subject, setSubject] = useState(`Order ${orderName} Update`);
  const [bodyDraft, setBodyDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const { data: msgData, isLoading: isMsgLoading } = useGetEmailMessages(orderId, {
    query: {
      queryKey: getGetEmailMessagesQueryKey(orderId),
      refetchInterval: 5000,
      enabled: !!orderId,
    },
  });

  const sendEmail = useSendEmail();

  const isConfigured = !!settings?.email_user && !!settings?.email_pass;
  const toEmail = customerEmail || "";
  const messages = msgData?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    if (!bodyDraft.trim() || !subject.trim() || !toEmail) return;

    sendEmail.mutate(
      {
        data: {
          to_email: toEmail,
          subject: subject.trim(),
          body: bodyDraft.trim(),
          order_id: orderId,
        },
      },
      {
        onSuccess: () => {
          toast.success("Email sent successfully!");
          setBodyDraft("");
          queryClient.invalidateQueries({ queryKey: getGetEmailMessagesQueryKey(orderId) });
        },
        onError: (err: any) => {
          console.error(err);
          toast.error("Failed to send email. Check your SMTP settings.");
        },
      }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-[680px] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Email Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 bg-blue-600 text-white shrink-0">
          <button onClick={onClose} className="hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold shrink-0">
            {customerName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{customerName}</div>
            <div className="text-xs text-blue-100 truncate">
              {toEmail || `Order ${orderName}`}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs bg-blue-700/50 px-2 py-1 rounded border border-blue-500/30">
            <Mail className="w-3.5 h-3.5" /> Gmail
          </div>
        </div>

        {/* Not configured banner */}
        {!isConfigured && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
            <div className="flex items-center gap-2 text-amber-700 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Gmail is not configured — enter credentials in settings
            </div>
            <button
              onClick={() => { onClose(); navigate("/settings"); }}
              className="text-[11px] font-medium text-amber-700 hover:underline flex items-center gap-1 shrink-0"
            >
              <Settings className="w-3 h-3" /> Setup
            </button>
          </div>
        )}

        {/* No email banner */}
        {isConfigured && !toEmail && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs shrink-0">
            No email address associated with this order — cannot send email.
          </div>
        )}

        {/* Chat / Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50/70 space-y-4">
          {isMsgLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <div className="text-3xl text-gray-300">✉</div>
              <div className="text-sm text-gray-600 font-medium">No emails sent yet</div>
              <div className="text-xs text-gray-400">
                {isConfigured && toEmail
                  ? "Compose a message below to email the customer"
                  : "Setup settings or configure email to get started"}
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-2">
                <span className="text-[10px] text-gray-400 bg-gray-200/50 rounded-full px-3 py-0.5 font-medium">
                  Sent Email History
                </span>
              </div>

              {messages.map((msg) => (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tr-sm p-3.5 shadow-sm max-w-[85%] space-y-1.5">
                    <div className="flex justify-between items-center gap-4 border-b border-gray-100 pb-1">
                      <span className="text-[11px] font-semibold text-blue-600 truncate">
                        Subject: {msg.subject}
                      </span>
                      <span className="text-[9px] text-gray-400 shrink-0">
                        {fmtDate(msg.timestamp)} {fmtTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {msg.body}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Composer Form */}
        <div className="p-4 border-t border-gray-200 bg-white space-y-3 shrink-0">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!isConfigured || !toEmail}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="Email Subject"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Message Body</label>
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              disabled={!isConfigured || !toEmail}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed resize-none"
              placeholder={
                !isConfigured ? "Setup Gmail SMTP configuration first..." :
                !toEmail ? "Customer has no email address..." :
                "Type email content here..."
              }
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSend}
              disabled={!bodyDraft.trim() || !subject.trim() || !isConfigured || !toEmail || sendEmail.isPending}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sendEmail.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Send Email
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compact Preview Card ───────────────────────────────────────────
export function EmailChat({ customerName, customerEmail, orderName, orderId }: EmailChatProps) {
  const [open, setOpen] = useState(false);

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const { data: msgData } = useGetEmailMessages(orderId, {
    query: {
      queryKey: getGetEmailMessagesQueryKey(orderId),
      enabled: !!orderId,
    },
  });

  const isConfigured = !!settings?.email_user && !!settings?.email_pass;
  const messages = msgData?.messages ?? [];
  const lastMsg = messages[messages.length - 1];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md transition-all overflow-hidden group"
      >
        {/* Blue header strip */}
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-600">
          <Mail className="w-4 h-4 text-white shrink-0" />
          <span className="text-xs font-semibold text-white">Customer Email</span>
          <div className="ml-auto flex items-center gap-1">
            {isConfigured ? (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            )}
          </div>
        </div>

        {/* Preview body */}
        <div className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
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
                    <span className="font-semibold text-blue-600 shrink-0">[Subject: {lastMsg.subject}]</span>
                    {lastMsg.body}
                  </>
                ) : (
                  <span className="italic text-gray-400">
                    {isConfigured ? "No emails sent yet — tap to send" : "Configure Gmail to send updates"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-blue-600 font-medium group-hover:underline">
            {isConfigured ? "Open email client →" : "⚠ Configure Gmail in Settings →"}
          </div>
        </div>
      </button>

      {open && (
        <FullEmailModal
          customerName={customerName}
          customerEmail={customerEmail}
          orderName={orderName}
          orderId={orderId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
