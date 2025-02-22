import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">Overview</h1>

      <Card>
        <CardHeader>
          <CardTitle>Welcome to FlowDesk</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This section will be updated with an overview of your CFD simulations and analysis.
          </p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}