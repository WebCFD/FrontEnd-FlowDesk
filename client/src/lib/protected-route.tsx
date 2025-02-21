import { useEffect } from "react";
import { useLocation } from "wouter";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include"
        });
        
        if (!response.ok) {
          setLocation("/");
        }
      } catch (error) {
        setLocation("/");
      }
    }
    
    checkAuth();
  }, [setLocation]);

  return <>{children}</>;
}
