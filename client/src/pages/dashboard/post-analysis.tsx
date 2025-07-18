import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileText, TrendingUp, Download, Eye, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { Simulation } from "@shared/schema";

// Utility function to format dates
const formatDate = (date: string) => {
  const now = new Date();
  const simulationDate = new Date(date);
  const diffInMilliseconds = now.getTime() - simulationDate.getTime();
  const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return "Today";
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays} days ago`;
  return simulationDate.toLocaleDateString();
};

export default function PostAnalysis() {
  const { user } = useAuth();

  // Fetch completed simulations
  const { data: completedSimulations = [], isLoading, error } = useQuery<Simulation[]>({
    queryKey: ['/api/simulations/completed'],
    enabled: !!user && !user.isAnonymous,
  });

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">Post & Analysis</h1>
      
      <div className="space-y-6">
        {/* Completed Simulations Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Completed Simulations
            </CardTitle>
            <CardDescription>
              Select a completed simulation to view analysis results and generate reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground">Loading completed simulations...</div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-600">Error loading simulations</div>
              </div>
            ) : completedSimulations.length === 0 ? (
              <div className="text-center py-8">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-muted rounded-full">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">No Completed Simulations</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  You don't have any completed simulations yet. Complete a simulation from the Run Case Wizard to access analysis tools.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a simulation to analyze" />
                  </SelectTrigger>
                  <SelectContent>
                    {completedSimulations.map((simulation) => (
                      <SelectItem key={simulation.id} value={simulation.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium">{simulation.name}</span>
                          <div className="flex items-center gap-2 ml-4">
                            <Badge variant="secondary" className="text-xs">
                              {simulation.packageType}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(simulation.completedAt || simulation.createdAt)}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{completedSimulations.length} completed simulations</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>Analysis tools available</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Download className="h-4 w-4" />
                    <span>Export capabilities</span>
                  </div>
                </div>
              </div>
            )}
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
    </DashboardLayout>
  );
}