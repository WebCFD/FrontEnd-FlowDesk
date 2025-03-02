import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Simulations from "@/pages/dashboard/simulations";
import Settings from "@/pages/dashboard/settings";
import Profile from "@/pages/dashboard/profile";
import NewSimulation from "@/pages/dashboard/new-simulation";
import WizardDesign from "@/pages/dashboard/wizard-design";
import { ProtectedRoute } from "@/lib/protected-route";
import { AuthProvider } from "@/hooks/use-auth";
import DashboardLayout from "@/components/layout/dashboard-layout";

// Wrap the component with DashboardLayout for dashboard routes
const withDashboardLayout = (Component: () => React.JSX.Element) => {
  return () => (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <ProtectedRoute path="/dashboard" component={withDashboardLayout(Dashboard)} />
      <ProtectedRoute path="/dashboard/simulations" component={withDashboardLayout(Simulations)} />
      <ProtectedRoute path="/dashboard/settings" component={withDashboardLayout(Settings)} />
      <ProtectedRoute path="/dashboard/profile" component={withDashboardLayout(Profile)} />
      <ProtectedRoute path="/dashboard/new-simulation" component={withDashboardLayout(NewSimulation)} />
      <ProtectedRoute path="/dashboard/wizard-design" component={withDashboardLayout(WizardDesign)} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">
            <Router />
          </main>
        </div>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;