import { useEffect } from "react";
import { useLocation } from "wouter";
import { useRoomStore } from "@/lib/store/room-store";
import { useRoomReset } from "@/hooks/use-room-reset";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const [, setLocation] = useLocation();
  const { confirmReset, ResetDialog } = useRoomReset();
  const { lines, airEntries } = useRoomStore();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      if (lines.length > 0 || airEntries.length > 0) {
        confirmReset(() => setLocation("/auth"));
      } else {
        setLocation("/auth");
      }
    }
  }, [user, isLoading, setLocation, lines, airEntries, confirmReset]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <Component />
      <ResetDialog />
    </>
  );
}