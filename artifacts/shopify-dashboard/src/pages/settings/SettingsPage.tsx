import { useRoute, useLocation } from "wouter";
import { Store, Truck, MessageCircle, Mail, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { StoresTab } from "./StoresTab";
import { ShiprocketTab } from "./ShiprocketTab";
import { WhatsappTab } from "./WhatsappTab";
import { EmailTab } from "./EmailTab";
import { SystemTab } from "./SystemTab";

const TABS = [
  { key: "stores", label: "Shopify stores", icon: Store, el: StoresTab },
  { key: "shiprocket", label: "Shiprocket", icon: Truck, el: ShiprocketTab },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, el: WhatsappTab },
  { key: "email", label: "Email", icon: Mail, el: EmailTab },
  { key: "system", label: "System & webhooks", icon: Server, el: SystemTab },
];

export default function SettingsPage() {
  const [, params] = useRoute("/settings/:tab");
  const [, navigate] = useLocation();
  const active = TABS.find((t) => t.key === params?.tab) ?? TABS[0];
  const El = active.el;
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 space-y-0.5 border-r bg-card p-3">
        <h1 className="mb-2 px-2 text-lg font-semibold">Settings</h1>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(`/settings/${t.key}`)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
              t.key === active.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          <El />
        </div>
      </div>
    </div>
  );
}
