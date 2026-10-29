import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { StoreProvider } from "@/hooks/use-stores";
import { api, authEvents } from "@/lib/api";
import Login from "@/pages/Login";
import OrdersPage from "@/pages/orders/OrdersPage";
import OverviewPage from "@/pages/overview/OverviewPage";
import OrderDetailPage from "@/pages/orders/OrderDetailPage";
import CheckoutsPage from "@/pages/checkouts/CheckoutsPage";
import CheckoutDetailPage from "@/pages/checkouts/CheckoutDetailPage";
import InboxPage from "@/pages/inbox/InboxPage";
import AutomationsPage from "@/pages/automations/AutomationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000 } },
});

function AuthGate() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api<{ passwordSet: boolean; loggedIn: boolean }>("/auth/status"),
  });
  useEffect(() => {
    const onUnauth = () => qc.invalidateQueries({ queryKey: ["auth"] });
    authEvents.addEventListener("unauthorized", onUnauth);
    return () => authEvents.removeEventListener("unauthorized", onUnauth);
  }, [qc]);

  if (isLoading) return null;
  if (!data?.loggedIn) {
    return <Login firstRun={!data?.passwordSet} onDone={() => qc.invalidateQueries()} />;
  }
  return (
    <StoreProvider>
      <AppLayout>
        <Switch>
          <Route path="/overview" component={OverviewPage} />
          <Route path="/" component={OrdersPage} />
          <Route path="/orders/:id" component={OrderDetailPage} />
          <Route path="/abandoned" component={CheckoutsPage} />
          <Route path="/abandoned/:id" component={CheckoutDetailPage} />
          <Route path="/inbox" component={InboxPage} />
          <Route path="/inbox/:contact" component={InboxPage} />
          <Route path="/automations" component={AutomationsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/settings/:tab" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </StoreProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate />
        </WouterRouter>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
