import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/dashboard/settings";
import Profile from "@/pages/dashboard/profile";
import NewSimulation from "@/pages/dashboard/new-simulation";
import WizardDesign from "@/pages/dashboard/wizard-design";
import Analysis from "@/pages/dashboard/analysis";
import Learning from "@/pages/dashboard/learning";
import AdminDatabasePage from "@/pages/admindatabase";
import ActivatePage from "@/pages/activate";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import About from "@/pages/about";

import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { ProtectedRoute } from "@/lib/protected-route";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />

      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/new-simulation">
        <ProtectedRoute>
          <NewSimulation />
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard/wizard-design" component={WizardDesign} />

      <Route path="/dashboard/learning" component={Learning} />

      <Route path="/dashboard/analysis/:id">
        <ProtectedRoute>
          <Analysis />
        </ProtectedRoute>
      </Route>

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

      <Route path="/admindatabase" component={AdminDatabasePage} />
      <Route path="/activate" component={ActivatePage} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/about" component={About} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { setUser, user } = useAuth();
  const [location] = useLocation();

  const isDashboard = location.startsWith("/dashboard");
  const isLoggedIn = user && !user.isAnonymous;

  const showNavbar = !isDashboard && !isLoggedIn;
  const showFooter = !isDashboard;

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include",
        });

        if (response.ok) {
          const userData = await response.json();
          setUser({
            username: userData.username,
            email: userData.email,
            isAnonymous: false,
          });
        }
      } catch {
        console.log("User not authenticated on startup");
      }
    };

    checkAuthStatus();
  }, [setUser]);

  return (
    <QueryClientProvider client={queryClient}>
      <>
        <div className="min-h-screen flex flex-col">
          {showNavbar && <Navbar />}

          <main className={cn("flex-1", showNavbar && "pt-16")}>
            <Router />
          </main>

          {showFooter && <Footer />}
        </div>

        <Toaster />
      </>
    </QueryClientProvider>
  );
}

export default App;
