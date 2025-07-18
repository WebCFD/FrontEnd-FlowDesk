import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Play, Mail, MoreHorizontal, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRoomStore } from "@/lib/store/room-store";
import { useAuth } from "@/hooks/use-auth";
import type { Simulation } from "@shared/schema";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Utility function to format dates
const formatDate = (date: string) => {
  const now = new Date();
  const simulationDate = new Date(date);
  const diffInMilliseconds = now.getTime() - simulationDate.getTime();
  const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  if (diffInDays < 7) return `${diffInDays} days ago`;
  return simulationDate.toLocaleDateString();
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [showNewSimulationDialog, setShowNewSimulationDialog] = useState(false);
  const { lines, reset } = useRoomStore();
  const { user } = useAuth();

  // Fetch user simulations
  const { data: simulations = [], isLoading, error } = useQuery<Simulation[]>({
    queryKey: ['/api/simulations'],
    enabled: !!user && !user.isAnonymous,
  });



  const handleStartSimulation = () => {
    if (lines.length > 0) {
      setShowNewSimulationDialog(true);
    } else {
      reset();
      setLocation("/dashboard/wizard-design");
    }
  };

  const handleConfirmNewSimulation = () => {
    reset();
    setShowNewSimulationDialog(false);
    setLocation("/dashboard/wizard-design");
  };

  const handleReturnToWizard = () => {
    setShowNewSimulationDialog(false);
    setLocation("/dashboard/wizard-design");
  };

  const handleHowItWorks = () => {
    setIsVideoOpen(true);
  };

  const handleContactSupport = () => {
    window.location.href = "mailto:support@flowdesk.com";
  };

  return (
    <DashboardLayout>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <div className="space-y-6">
        {/* Welcome Section */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome to FlowDesk</CardTitle>
            <CardDescription>Ready to shape your latest design?</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button 
              onClick={handleStartSimulation}
              className="flex items-center gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              Start New Simulation
            </Button>
            <Button 
              variant="outline" 
              onClick={handleHowItWorks}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              How it Works
            </Button>
          </CardContent>
        </Card>

        {/* Expert Advice Section */}
        <Card>
          <CardHeader>
            <CardTitle>Ask Expert Advice</CardTitle>
            <CardDescription>Want personal assistance by one of our experts?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Button 
                onClick={handleContactSupport}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Get in Touch
              </Button>
              <div className="text-sm text-muted-foreground">
                Available Credits: €500
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Simulations */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Recent Simulations</CardTitle>
            <CardDescription>Your latest thermal analysis projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created at</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading simulations...
                      </TableCell>
                    </TableRow>
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-red-600">
                        Error loading simulations
                      </TableCell>
                    </TableRow>
                  ) : simulations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No simulations found. Create your first simulation to get started!
                      </TableCell>
                    </TableRow>
                  ) : (
                    simulations.map((simulation) => (
                      <TableRow key={simulation.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {simulation.name}
                            {simulation.isPublic && (
                              <Badge variant="secondary" className="text-xs">
                                Public
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                            {simulation.filePath}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              simulation.status === "processing" ? "default" :
                              simulation.status === "completed" ? "secondary" :
                              "destructive"
                            }
                            className={
                              simulation.status === "processing" ? "bg-blue-100 text-blue-800 border-blue-200" :
                              simulation.status === "completed" ? "bg-green-100 text-green-800 border-green-200" :
                              "bg-red-100 text-red-800 border-red-200"
                            }
                          >
                            {simulation.status.charAt(0).toUpperCase() + simulation.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(simulation.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <div>Displaying {simulations.length} items</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="w-8 h-8 p-0">
                    1
                  </Button>
                </div>
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How it Works Video Dialog */}
      <Dialog open={isVideoOpen} onOpenChange={setIsVideoOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>How FlowDesk Works</DialogTitle>
          </DialogHeader>
          <div className="aspect-video">
            <iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/-cyPLRfry7k"
              title="FlowDesk Tutorial"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Simulation Confirmation Dialog */}
      <AlertDialog open={showNewSimulationDialog} onOpenChange={setShowNewSimulationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start New Simulation?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an existing room in the WizardDesign. Starting a new simulation will clear your current design. 
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleReturnToWizard}>Return to WizardDesign</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNewSimulation}>
              New Design
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}