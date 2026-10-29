import { useEffect, useState, type ComponentProps } from "react";
import { MessageCircle, Mail, X, Maximize2, Minimize2, Minus } from "lucide-react";
import { initials, phone as fmtPhone } from "@/lib/format";
import { ChatPanel } from "./ChatPanel";
import { cn } from "@/lib/utils";

type Channel = "whatsapp" | "email";
type PanelProps = Omit<ComponentProps<typeof ChatPanel>, "channel" | "onChannelChange" | "hideChannelTabs">;

/**
 * WhatsApp + email as a floating chat window (bottom-right), so the page
 * behind it keeps its full width. Open it from the launcher or via `openSignal`.
 */
export function ChatPopup({
  openSignal,
  hideLauncher,
  onClose,
  subtitle,
  ...panel
}: PanelProps & {
  /** list pages open the popup only from their own buttons */
  hideLauncher?: boolean;
  onClose?: () => void;
  subtitle?: string;
  /** bump `n` (with a channel) to open the popup from elsewhere on the page */
  openSignal?: { n: number; channel: Channel };
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [channel, setChannel] = useState<Channel>(panel.phone ? "whatsapp" : "email");

  useEffect(() => {
    if (openSignal && openSignal.n > 0) {
      setChannel(openSignal.channel);
      setOpen(true);
    }
  }, [openSignal?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (c: Channel) => panel.messages.filter((m) => m.channel === c).length;
  const unread = (c: Channel) => panel.messages.filter((m) => m.channel === c && m.direction === "in" && !m.read).length;
  const totalUnread = unread("whatsapp") + unread("email");

  const show = (c: Channel) => {
    setChannel(c);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  if (!open) {
    if (hideLauncher) return null;
    return (
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
        {panel.phone && (
          <Launcher onClick={() => show("whatsapp")} className="bg-[#25D366] text-white hover:bg-[#1ebe5b]" icon={MessageCircle} label="WhatsApp" count={count("whatsapp")} unread={unread("whatsapp")} />
        )}
        {panel.email && (
          <Launcher onClick={() => show("email")} className="bg-sky-600 text-white hover:bg-sky-700" icon={Mail} label="Email" count={count("email")} unread={unread("email")} />
        )}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Chat with customer"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden border bg-card shadow-2xl",
        "inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:rounded-2xl",
        expanded ? "sm:h-[calc(100dvh-2.5rem)] sm:w-[560px]" : "sm:h-[min(600px,calc(100dvh-2.5rem))] sm:w-[400px]",
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-3 py-2.5 text-white", channel === "whatsapp" ? "bg-[#075E54]" : "bg-sky-700")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{initials(panel.name ?? "?")}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{panel.name || "Customer"}</p>
          <p className="truncate text-[11px] text-white/75">
            {subtitle && <>{subtitle} · </>}
            {channel === "whatsapp" ? fmtPhone(panel.phone) : panel.email}
          </p>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="hidden rounded p-1.5 hover:bg-white/15 sm:block" title={expanded ? "Smaller" : "Bigger"}>
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button onClick={close} className="rounded p-1.5 hover:bg-white/15" title="Minimise (Esc)">
          <Minus className="h-4 w-4 sm:block" />
        </button>
        <button onClick={close} className="rounded p-1.5 hover:bg-white/15 sm:hidden" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b bg-card text-xs font-medium">
        {(["whatsapp", "email"] as const).map((c) => {
          const disabled = c === "whatsapp" ? !panel.phone : !panel.email;
          const Icon = c === "whatsapp" ? MessageCircle : Mail;
          return (
            <button
              key={c}
              disabled={disabled}
              onClick={() => setChannel(c)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 disabled:opacity-40",
                channel === c ? (c === "whatsapp" ? "border-[#25D366] text-foreground" : "border-sky-600 text-foreground") : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {c === "whatsapp" ? "WhatsApp" : "Email"}
              {count(c) > 0 && <span className="text-muted-foreground">{count(c)}</span>}
              {unread(c) > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] text-white">{unread(c)}</span>}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        <ChatPanel {...panel} channel={channel} onChannelChange={setChannel} hideChannelTabs />
      </div>
      {totalUnread > 0 && <span className="sr-only">{totalUnread} unread</span>}
    </div>
  );
}

function Launcher({
  onClick,
  className,
  icon: Icon,
  label,
  count,
  unread,
}: {
  onClick: () => void;
  className: string;
  icon: typeof Mail;
  label: string;
  count: number;
  unread: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("relative flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.03]", className)}
      title={`Open ${label} chat`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
      {count > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs">{count}</span>}
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
          {unread}
        </span>
      )}
    </button>
  );
}
