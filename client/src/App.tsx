import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        {/* Only show Navbar and Footer on non-dashboard pages */}
        <Route path="/dashboard/*">
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