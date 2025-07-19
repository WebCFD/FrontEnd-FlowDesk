import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LucideIcon, LayoutDashboard, Settings, User, LogOut, Wand2, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useRoomStore } from "@/lib/store/room-store";
import { customFurnitureStore } from "@/lib/custom-furniture-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SidebarItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

const sidebarItems: SidebarItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    icon: Wand2,
    label: "Run Case Wizard",
    href: "/dashboard/wizard-design",
  },
  {
    icon: BarChart3,
    label: "Post & Analysis",
    href: "/dashboard/post-analysis",
  },
  {
    icon: Settings,
    label: "Settings",
    href: "/dashboard/settings",
  },
  {
    icon: User,
    label: "Profile",
    href: "/dashboard/profile",
  },
];

export default function DashboardSidebar() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [userData, setUserData] = useState<{ username: string; id: number } | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const { reset } = useRoomStore();

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setUserData(data);
        } else {
          setUserData(null);
        }
        // Don't log 401 errors as they're expected when not authenticated
      } catch (error) {
        // Only log unexpected errors, not authentication errors
        if (error instanceof Error && !error.message.includes('401')) {
          console.error("Failed to fetch user data:", error);
        }
        setUserData(null);
      }
    }
    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        // Clear room data
        reset();
        
        // Complete reset of custom furniture store (Logout behavior)
        customFurnitureStore.reset();

        toast({
          title: "Success!",
          description: "You have been logged out. Your room design has been cleared.",
        });
        setLocation("/");
      } else {
        throw new Error("Failed to logout");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to logout. Please try again.",
      });
    }
  };

  return (
    <div className="w-64 h-screen bg-white border-r border-gray-200">
      <div className="p-6">
        <Link href="/dashboard" className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors">
          FlowDesk
        </Link>
        <div className="mt-2 text-sm text-gray-600">
          {userData ? `Hi, ${userData.username}` : "No login yet"}
        </div>
      </div>
      <nav className="px-4 py-2">
        <div className="space-y-1">
          {sidebarItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            const showSeparator = item.label === "Settings"; // Separador antes de Settings

            return (
              <div key={item.href}>
                {showSeparator && (
                  <div className="mt-2 pt-2 border-t border-gray-200" />
                )}
                <Link 
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-white shadow-md"
                      : "text-gray-700 hover:bg-blue-50 hover:text-primary hover:shadow-sm"
                  )}
                >
                  <Icon className={cn("h-5 w-5", isActive ? "text-white" : "")} />
                  {item.label}
                </Link>
              </div>
            );
          })}

          <div className="mt-2 pt-2 border-t border-gray-200">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-primary hover:shadow-sm transition-all duration-200"
              onClick={() => setShowLogoutDialog(true)}
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout? Your current room design will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowLogoutDialog(false);
              handleLogout();
            }}>
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}