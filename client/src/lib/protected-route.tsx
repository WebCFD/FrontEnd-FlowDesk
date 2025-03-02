import { useEffect } from "react";
import { useLocation } from "wouter";
import { useRoomStore } from "@/lib/store/room-store";
import { useRoomReset } from "@/hooks/use-room-reset";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { confirmReset, ResetDialog } = useRoomReset();
  const { lines, airEntries } = useRoomStore();

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include"
        });

        if (!response.ok) {
          if (lines.length > 0 || airEntries.length > 0) {
            confirmReset(() => setLocation("/"));
          } else {
            setLocation("/");
          }
        }
      } catch (error) {
        setLocation("/");
      }
    }

    checkAuth();
  }, [setLocation, lines, airEntries, confirmReset]);

  return (
    <>
      {children}
      <ResetDialog />
    </>
  );
}