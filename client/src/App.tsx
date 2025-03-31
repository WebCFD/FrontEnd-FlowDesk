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
// Test component for debugging
import Canvas3DTest from "@/pages/canvas3d-test";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { ProtectedRoute } from "@/lib/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/simulations">
        <ProtectedRoute>
          <Simulations />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/new-simulation">
        <ProtectedRoute>
          <NewSimulation />
        </ProtectedRoute>
      </Route>
      {/* Remove ProtectedRoute wrapper to allow direct access */}
      <Route path="/dashboard/wizard-design" component={WizardDesign} />
      <Route path="/canvas3d-test" component={Canvas3DTest} />
      <Route path="/dashboard/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        <Route path="/dashboard*">
          <Router />
        </Route>
        <Route path="*">
          <>
            <Navbar />
            <main className="flex-1">
              <Router />
            </main>
            <Footer />
          </>
        </Route>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;