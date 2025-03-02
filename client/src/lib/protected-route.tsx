import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { user, setAnonymousUser } = useAuth();

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include"
        });

        if (!response.ok) {
          // Instead of redirecting, set as anonymous user
          setAnonymousUser();
        }
      } catch (error) {
        // On error, also set as anonymous user
        setAnonymousUser();
      }
    }

    checkAuth();
  }, [setLocation, setAnonymousUser]);

  return <>{children}</>;
}

// New component for forcing authentication
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.isAnonymous) {
      setLocation("/auth");
    }
  }, [user, setLocation]);

  return <>{children}</>;
}