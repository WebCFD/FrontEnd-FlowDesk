import DashboardSidebar from "./dashboard-sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  fullHeight?: boolean;
}

export default function DashboardLayout({ children, fullHeight }: DashboardLayoutProps) {
  if (fullHeight) {
    return (
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        <DashboardSidebar />
        <main className="flex-1 bg-background overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-6 pt-8">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <main className="flex-1 bg-background">
        <div className="container mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
