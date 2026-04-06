import DashboardSidebar from "./dashboard-sidebar";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  fullHeight?: boolean;
}

export default function DashboardLayout({ children, fullHeight }: DashboardLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar onCollapseChange={setIsCollapsed} />
      
      <main className={cn(
        "transition-all duration-300",
        isCollapsed ? "ml-16" : "ml-52"
      )}>
        <div className={cn(
          "px-6",
          fullHeight ? "h-screen overflow-auto pt-8" : "py-8"
        )}>
          {children}
        </div>
      </main>
    </div>
  );
}
