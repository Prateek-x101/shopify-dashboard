import { useState } from "react";
import { Lock } from "lucide-react";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login({ firstRun, onDone }: { firstRun: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (firstRun && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await post(firstRun ? "/auth/setup" : "/auth/login", { password });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">{firstRun ? "Set a dashboard password" : "Sign in"}</h1>
            <p className="text-xs text-muted-foreground">
              {firstRun ? "Protects your stores and chats when the dashboard is reachable online." : "Enter your dashboard password."}
            </p>
          </div>
        </div>
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {firstRun && <Input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || password.length < 6}>
          {firstRun ? "Save and continue" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
