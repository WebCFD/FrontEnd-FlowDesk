import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LucideIcon, LayoutDashboard, Wind, Settings, User } from "lucide-react";

interface SidebarItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

const sidebarItems: SidebarItem[] = [
  {
    icon: LayoutDashboard,
    label: "Overview",
    href: "/dashboard",
  },
  {
    icon: Wind,
    label: "Simulations",
    href: "/dashboard/simulations",
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

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border">
      <div className="p-6">
        <Link href="/">
          <a className="text-2xl font-bold text-sidebar-primary">AirShaper</a>
        </Link>
      </div>
      <nav className="px-4 py-2">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;

          return (
            <Link key={item.href} href={item.href}>
              <a
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </a>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
