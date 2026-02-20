import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileText, Eye, Download, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import VTKViewer from "@/components/visualization/VTKViewer";
import type { Simulation } from "@shared/schema";

export default function Analysis() {
  const [, params] = useRoute("/dashboard/analysis/:id");
  const [, setLocation] = useLocation();
  const simulationId = params?.id ? parseInt(params.id, 10) : null;

  const { data: simulation, isLoading, error } = useQuery<Simulation>({
    queryKey: [`/api/simulations/${simulationId}`],
    enabled: simulationId !== null && !isNaN(simulationId),
  });

  return (
    <DashboardLayout>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading simulation data...</div>
      ) : error || !simulation ? (
        <div className="text-center py-16">
          <p className="text-red-600 mb-4">Could not load this simulation.</p>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            Return to Dashboard
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-8">
            <h1 className="text-3xl font-bold">Post & Analysis</h1>
            <Badge variant="secondary" className="text-sm bg-green-100 text-green-800 border-green-200">
              {simulation.status.charAt(0).toUpperCase() + simulation.status.slice(1)}
            </Badge>
          </div>

          <p className="text-muted-foreground mb-6">
            Simulation: <span className="font-medium text-foreground">{simulation.name}</span>
            {simulation.packageType && (
              <Badge variant="outline" className="ml-2 text-xs">{simulation.packageType}</Badge>
            )}
          </p>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  3D Visualization (VTK.js)
                </CardTitle>
                <CardDescription>
                  Interactive 3D visualization of simulation results
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VTKViewer
                  simulationId={simulation.id}
                  className="w-full"
                />
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Reports
                  </CardTitle>
                  <CardDescription>
                    Generate detailed analysis reports
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      Report generation tools will be available here
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Analytics
                  </CardTitle>
                  <CardDescription>
                    Advanced data visualization and insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      Analytics dashboard will be implemented here
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
