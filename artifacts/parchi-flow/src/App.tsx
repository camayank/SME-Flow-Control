import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import Layout from "@/components/layout";
import LoginPage from "@/pages/login";
import OnboardingPage from "@/pages/onboarding";
import DashboardPage from "@/pages/dashboard";
import ParchiPage from "@/pages/parchi";
import PartiesPage from "@/pages/parties";
import PartyDetailPage from "@/pages/party-detail";
import OutstandingsPage from "@/pages/outstandings";
import CollectionsPage from "@/pages/collections";
import ReconciliationPage from "@/pages/reconciliation";
import ImportPage from "@/pages/import";
import ReportsPage from "@/pages/reports";
import ItemsPage from "@/pages/items";
import InvoicesPage from "@/pages/invoices";
import AuditPage from "@/pages/audit";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function AppContent() {
  const { isAuthenticated, isLoading, hasBusiness } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-48">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route><Redirect to="/login" /></Route>
      </Switch>
    );
  }

  if (!hasBusiness) {
    return (
      <Switch>
        <Route path="/onboarding" component={OnboardingPage} />
        <Route><Redirect to="/onboarding" /></Route>
      </Switch>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/parchi" component={ParchiPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/items" component={ItemsPage} />
        <Route path="/audit" component={AuditPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/parties" component={PartiesPage} />
        <Route path="/parties/:id" component={PartyDetailPage} />
        <Route path="/outstandings" component={OutstandingsPage} />
        <Route path="/collections" component={CollectionsPage} />
        <Route path="/reconciliation" component={ReconciliationPage} />
        <Route path="/import" component={ImportPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
