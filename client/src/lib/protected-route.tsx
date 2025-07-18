import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, setAnonymousUser, setReturnTo } = useAuth();

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include"
        });

        if (!response.ok) {
          // Store current path before setting anonymous user
          console.log("ProtectedRoute: Setting returnTo to", location);
          setReturnTo(location);
          // Instead of redirecting, set as anonymous user
          setAnonymousUser();
        }
      } catch (error) {
        // Store current path before setting anonymous user
        setReturnTo(location);
        // On error, also set as anonymous user
        setAnonymousUser();
      }
    }

    checkAuth();
  }, [setLocation, setAnonymousUser, setReturnTo, location]);

  return <>{children}</>;
}

// New component for forcing authentication
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, setReturnTo } = useAuth();

  useEffect(() => {
    if (user?.isAnonymous) {
      setReturnTo(location);
      setLocation("/auth");
    }
  }, [user, setLocation, location, setReturnTo]);

  return <>{children}</>;
}