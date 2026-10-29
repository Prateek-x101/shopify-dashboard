import { MessageCircle, Mail, AlertOctagon, Send } from "lucide-react";
import { ago } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MsgStatus } from "@/components/common/Status";
import { cn } from "@/lib/utils";

const INTENT_LABEL: Record<string, string> = { complaint: "Complaint", cancel: "Wants to cancel", confirm: "Confirmed", query: "Asking for status" };

/**
 * Who is waiting for us: inbound WhatsApp / email counts, unread dots and a
 * complaint flag. Each chip opens the chat popup on that channel.
 */
export function ConversationCell({
  c,
  complaintOpen,
  lastWaStatus,
  hasPhone,
  hasEmail,
  onOpen,
}: {
  c: Conversation | undefined;
  complaintOpen: boolean;
  lastWaStatus: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  onOpen: (channel: "whatsapp" | "email") => void;
}) {
  const conv = c ?? { waIn: 0, waUnread: 0, emailIn: 0, emailUnread: 0, sent: 0, failed: 0, complaint: false, lastIn: null };
  const nothing = conv.waIn + conv.emailIn + conv.sent === 0;
  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <Chip
          icon={MessageCircle}
          count={conv.waIn}
          unread={conv.waUnread}
          className="text-emerald-600"
          disabled={!hasPhone}
          title={hasPhone ? `WhatsApp: ${conv.waIn} received${conv.waUnread ? `, ${conv.waUnread} unread` : ""}` : "No phone number"}
          onClick={() => onOpen("whatsapp")}
          extra={!conv.waIn && lastWaStatus ? <MsgStatus status={lastWaStatus} className="h-3 w-3" /> : null}
        />
        <Chip
          icon={Mail}
          count={conv.emailIn}
          unread={conv.emailUnread}
          className="text-sky-600"
          disabled={!hasEmail}
          title={hasEmail ? `Email: ${conv.emailIn} received${conv.emailUnread ? `, ${conv.emailUnread} unread` : ""}` : "No email"}
          onClick={() => onOpen("email")}
        />
        {(complaintOpen || conv.complaint) && (
          <button
            onClick={() => onOpen(conv.lastIn?.channel ?? "whatsapp")}
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              complaintOpen ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500 line-through",
            )}
            title={complaintOpen ? "Open complaint" : "Complaint resolved"}
          >
            <AlertOctagon className="h-3 w-3" /> Complaint
          </button>
        )}
        {conv.failed > 0 && (
          <span className="text-[10px] font-medium text-destructive" title={`${conv.failed} message(s) failed to send`}>
            {conv.failed} failed
          </span>
        )}
      </div>
      {conv.lastIn ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => onOpen(conv.lastIn!.channel)} className="max-w-[190px] truncate text-left text-[11px] text-muted-foreground hover:text-foreground">
              {conv.lastIn.intent && <span className="mr-1 font-medium text-foreground">{INTENT_LABEL[conv.lastIn.intent]}:</span>}“{conv.lastIn.body}”
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p className="text-xs">{conv.lastIn.body}</p>
            <p className="mt-1 text-[10px] opacity-70">
              {conv.lastIn.channel === "email" ? "Email" : "WhatsApp"} · {ago(conv.lastIn.at)}
            </p>
          </TooltipContent>
        </Tooltip>
      ) : nothing ? (
        <span className="text-[11px] text-muted-foreground/60">No messages</span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Send className="h-3 w-3" /> {conv.sent} sent, no reply
        </span>
      )}
    </div>
  );
}

function Chip({
  icon: Icon,
  count,
  unread,
  className,
  disabled,
  title,
  onClick,
  extra,
}: {
  icon: typeof Mail;
  count: number;
  unread: number;
  className: string;
  disabled: boolean;
  title: string;
  onClick: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "relative flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors hover:bg-accent disabled:opacity-30",
        unread > 0 && "border-emerald-300 bg-emerald-50",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", className)} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
      {extra}
      {unread > 0 && <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">{unread}</span>}
    </button>
  );
}
