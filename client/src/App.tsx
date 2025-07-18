import { Switch, Route } from "wouter";
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
import PostAnalysis from "@/pages/dashboard/post-analysis";

import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { ProtectedRoute } from "@/lib/protected-route";
import { AnalyticsProvider } from "./components/common/AnalyticsProvider";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

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
      {/* Remove ProtectedRoute wrapper to allow direct access */}
      <Route path="/dashboard/wizard-design" component={WizardDesign} />
      <Route path="/dashboard/post-analysis">
        <ProtectedRoute>
          <PostAnalysis />
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { setUser } = useAuth();

  // Check if user is already authenticated on app startup
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
            isAnonymous: false
          });
        }
      } catch (error) {
        // User not authenticated, keep user as null
        console.log("User not authenticated on startup");
      }
    };

    checkAuthStatus();
  }, [setUser]);

  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider debug={process.env.NODE_ENV === 'development'}>
        <div className="min-h-screen flex flex-col">
          <Switch>
            <Route path="/dashboard*">
              <>
                <Navbar />
                <main className="flex-1 pt-16">
                  <Router />
                </main>
                <Footer />
              </>
            </Route>
            <Route path="*">
              <>
                <Navbar />
                <main className="flex-1 pt-16">
                  <Router />
                </main>
                <Footer />
              </>
            </Route>
          </Switch>
        </div>
        <Toaster />
      </AnalyticsProvider>
    </QueryClientProvider>
  );
}

export default App;