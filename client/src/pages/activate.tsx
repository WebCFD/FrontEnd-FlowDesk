import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type ActivationState = "loading" | "success" | "error";

export default function ActivatePage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<ActivationState>("loading");
  const [message, setMessage] = useState("");
  const { setUser } = useAuth();

  useEffect(() => {
    const activateAccount = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("token");

        if (!token) {
          setState("error");
          setMessage("Invalid activation link. No token provided.");
          return;
        }

        const response = await fetch(`/api/auth/activate?token=${token}`, {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          setState("error");
          setMessage(data.message || "Activation failed. Please try again.");
          return;
        }

        // Update auth state with the logged-in user
        if (data.user) {
          setUser({
            username: data.user.username,
            email: data.user.email,
            isAnonymous: false,
          });
        }

        setState("success");
        setMessage(data.message || "Your account has been activated successfully!");

        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          setLocation("/dashboard");
        }, 3000);
      } catch (error) {
        setState("error");
        setMessage("An unexpected error occurred. Please try again later.");
        console.error("Activation error:", error);
      }
    };

    activateAccount();
  }, [setLocation, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {state === "loading" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <CardTitle>Activating Your Account</CardTitle>
              <CardDescription>Please wait while we verify your email...</CardDescription>
            </>
          )}

          {state === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-green-600 dark:text-green-400">Success!</CardTitle>
              <CardDescription>{message}</CardDescription>
            </>
          )}

          {state === "error" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-red-600 dark:text-red-400">Activation Failed</CardTitle>
              <CardDescription>{message}</CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {state === "success" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                You will be redirected to your dashboard in a few seconds...
              </p>
              <Button
                onClick={() => setLocation("/dashboard")}
                className="w-full"
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard Now
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-2">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>What can you do?</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-2">
                  <li>Try registering again with a new email</li>
                  <li>Contact support if the problem persists</li>
                  <li>Make sure you're using the latest activation link</li>
                </ul>
              </div>
              <Button
                onClick={() => setLocation("/")}
                className="w-full"
                data-testid="button-go-home"
              >
                Go to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
