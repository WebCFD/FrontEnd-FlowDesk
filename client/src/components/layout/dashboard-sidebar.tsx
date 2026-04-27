import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LucideIcon,
  LayoutDashboard,
  Settings,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import LoginModal from "@/components/auth/login-modal";
import RegisterModal from "@/components/auth/register-modal";

interface SidebarItem {
  icon: LucideIcon;
  label: string;
  href: string;
  isSpecial?: boolean;
}

interface DashboardSidebarProps {
  onCollapseChange?: (collapsed: boolean) => void;
}

const sidebarItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  {
    icon: Wand2,
    label: "Build Model",
    href: "/dashboard/wizard-design",
    isSpecial: true,
  },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
  { icon: Play, label: "Learning", href: "/dashboard/learning" },
];

const COLLAPSE_BREAKPOINT = 1280;
const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

export default function DashboardSidebar({
  onCollapseChange,
}: DashboardSidebarProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { reset } = useRoomStore();
  const { setUser } = useAuth();

  const [userData, setUserData] = useState<{
    username: string;
    email: string;
    id: number;
  } | null>(null);

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (saved !== null) {
      return saved === "true";
    }
    return window.innerWidth < COLLAPSE_BREAKPOINT;
  });

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const userButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const baseClasses =
    "w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 text-gray-700";

  const getItemClasses = (isActive: boolean) =>
    cn(
      baseClasses,
      isActive && "bg-primary text-white hover:bg-primary hover:text-white",
      !isActive && "hover:bg-blue-50 hover:text-primary"
    );

  const getCollapsedButtonClasses = () => {
    if (isCollapsed) {
      return "w-full flex items-center justify-center px-0 py-2 rounded-md text-sm font-medium transition-all duration-200 text-gray-700 hover:bg-blue-50 hover:text-primary";
    }
    return cn(baseClasses, "hover:bg-blue-50 hover:text-primary");
  };

  const renderNavItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const isActive = location === item.href;

    const content = (
      <div
        className={cn(getItemClasses(isActive), "cursor-pointer")}
        onClick={() => setLocation(item.href)}
      >
        <div className={cn("flex justify-center", isCollapsed ? "w-full" : "w-6")}>
          <Icon className="h-5 w-5" />
        </div>
        {!isCollapsed && <span className="ml-3">{item.label}</span>}
      </div>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider key={item.href} delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent side="right" className="ml-2">
              <p>{item.label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return content;
  };

  const renderSpecialNavItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const isActive = location === item.href;

    const content = (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          if (location === "/dashboard") {
            window.dispatchEvent(new CustomEvent("openCFDSelector"));
          } else {
            sessionStorage.setItem("openCFDSelector", "true");
            setLocation("/dashboard");
          }
        }}
        className={getItemClasses(isActive)}
      >
        <div className={cn("flex justify-center", isCollapsed ? "w-full" : "w-6")}>
          <Icon className="h-5 w-5" />
        </div>
        {!isCollapsed && <span className="ml-3">{item.label}</span>}
      </button>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider key={item.href} delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            <TooltipContent side="right" className="ml-2">
              <p>{item.label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return content;
  };

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
      } catch {
        setUserData(null);
      }
    }

    fetchUserData();
  }, [isLoginOpen, isRegisterOpen]);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, isCollapsed.toString());
    onCollapseChange?.(isCollapsed);
  }, [isCollapsed, onCollapseChange]);

 useEffect(() => {
  let resizeTimeout: NodeJS.Timeout;

  const handleResize = () => {
    clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
      setIsCollapsed(window.innerWidth < COLLAPSE_BREAKPOINT);
    }, 150);
  };

  handleResize(); // also apply on mount

  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
    clearTimeout(resizeTimeout);
  };
}, []);

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        reset();
        customFurnitureStore.reset();
        setUser(null);
        setUserData(null);

        localStorage.removeItem(COLLAPSE_STORAGE_KEY);
        localStorage.removeItem(COLLAPSE_STORAGE_KEY + "_manual");

        toast({
          title: "Success!",
          description: "You have been logged out.",
        });

        setShowUserMenu(false);
        setLocation("/");

        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        throw new Error();
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to logout. Please try again.",
      });
    }
  };

  useEffect(() => {
    if (showUserMenu && userButtonRef.current && userMenuRef.current) {
      const buttonRect = userButtonRef.current.getBoundingClientRect();
      const menuRect = userMenuRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      let top = buttonRect.top;

      if (top + menuRect.height > viewportHeight - 10) {
        top = buttonRect.bottom - menuRect.height;
      }

      if (top < 10) {
        top = 10;
      }

      setMenuPosition({
        top,
        left: buttonRect.right + 16,
      });
    }
  }, [showUserMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showUserMenu &&
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node) &&
        userButtonRef.current &&
        !userButtonRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  const renderCollapseButton = () => {
    const button = (
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        className={getCollapsedButtonClasses()}
      >
        <div className={cn("flex justify-center", isCollapsed ? "w-full" : "w-6")}>
          {isCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </div>
        {!isCollapsed && <span className="ml-3">Collapse sidebar</span>}
      </button>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="ml-2">
              <p>Expand sidebar</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-gray-200 transition-all duration-300 fixed top-0 left-0 h-screen bg-white z-50",
        isCollapsed ? "w-16" : "w-52"
      )}
    >
      <div className={cn("flex-shrink-0", isCollapsed ? "p-2" : "p-4")}>
        <Link href="/" className="flex items-center justify-center gap-2">
          <img
            src="/assets/logo.png"
            alt="Logo"
            className={cn(
              "object-contain transition-all duration-300 cursor-pointer",
              isCollapsed ? "h-12 w-12" : "h-10 w-10"
            )}
          />
          {!isCollapsed && <span className="text-xl font-bold">FlowDesk</span>}
        </Link>
      </div>

      <div className="mx-3 h-px bg-gray-200" />

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="space-y-1">
          {sidebarItems.map((item) =>
            item.isSpecial ? renderSpecialNavItem(item) : renderNavItem(item)
          )}
        </div>
      </nav>

      <div className="mx-3 h-px bg-gray-200" />

      <div className="p-3 flex flex-col gap-2">
        {renderCollapseButton()}

        <div>
          <button
            ref={userButtonRef}
            onClick={() => setShowUserMenu((prev) => !prev)}
            className={getCollapsedButtonClasses()}
          >
            <div
              className={cn(
                "flex justify-center",
                isCollapsed ? "w-full" : "w-6"
              )}
            >
              <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                {(userData?.username?.[0] || "G").toUpperCase()}
              </div>
            </div>
            {!isCollapsed && (
              <span className="ml-3">{userData?.username || "Guest"}</span>
            )}
          </button>

          {showUserMenu && (
            <div
              ref={userMenuRef}
              className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[220px]"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
              }}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-medium text-gray-900">
                  {userData?.username || "Guest"}
                </p>
                <p className="text-sm text-gray-500 mt-0.5 break-all">
                  {userData?.email || "Not logged in"}
                </p>
              </div>

              {userData ? (
                <>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setLocation("/dashboard/profile");
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    Account
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowLogoutDialog(true);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors text-gray-700 border-t border-gray-100"
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setIsLoginOpen(true);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    Log In
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setIsRegisterOpen(true);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors text-gray-700 border-t border-gray-100"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLogoutDialog(false);
                handleLogout();
              }}
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
    </div>
  );
}