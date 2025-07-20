import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Play, Mail, MoreHorizontal, ExternalLink, Trash2, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRoomStore } from "@/lib/store/room-store";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; simulationId?: number; simulationName?: string }>({ open: false });
  const { reset } = useRoomStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user simulations
  const { data: simulations = [], isLoading, error } = useQuery<Simulation[]>({
    queryKey: ['/api/simulations'],
    enabled: !!user && !user.isAnonymous,
  });

  // Fetch user data including credits
  const { data: userData } = useQuery({
    queryKey: ['/api/auth/user'],
    enabled: !!user && !user.isAnonymous,
  });

  // Delete simulation mutation
  const deleteSimulationMutation = useMutation({
    mutationFn: async (simulationId: number) => {
      return apiRequest("DELETE", `/api/simulations/${simulationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/simulations'] });
      toast({
        title: "Simulation Deleted",
        description: "The simulation has been successfully deleted.",
      });
      setDeleteDialog({ open: false });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete the simulation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteSimulation = (simulationId: number, simulationName: string) => {
    setDeleteDialog({ 
      open: true, 
      simulationId, 
      simulationName 
    });
  };

  const handleConfirmDelete = () => {
    if (deleteDialog.simulationId) {
      deleteSimulationMutation.mutate(deleteDialog.simulationId);
    }
  };

  const handleStartSimulation = () => {
    // Borrar los datos del diseño (igual que hace "Erase Design")
    reset();
    // Abrir el Run Case Wizard para que el usuario pueda empezar un nuevo diseño
    setLocation("/dashboard/wizard-design");
  };

  const handleHowItWorks = () => {
    setIsVideoOpen(true);
  };

  const handleContactSupport = () => {
    window.location.href = "mailto:support@flowdesk.com";
  };

  // Load design mutation
  const loadDesignMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const response = await fetch(`/api/files/${filePath}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to load design file');
      }
      return response.json();
    },
    onSuccess: (jsonData) => {
      // Use the existing load design functionality from wizard-design
      // We'll import and reuse the handleLoadDesign logic
      
      // First, navigate to wizard-design
      setLocation("/dashboard/wizard-design");
      
      // Store the JSON data temporarily for the wizard to pick up
      sessionStorage.setItem('pendingDesignLoad', JSON.stringify(jsonData));
      
      toast({
        title: "Design Loaded",
        description: "The design has been loaded successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Load Failed", 
        description: "Failed to load the design. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLoadDesign = (filePath: string) => {
    loadDesignMutation.mutate(filePath);
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
          <CardContent>
            <Button 
              onClick={handleContactSupport}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Get in Touch
            </Button>
          </CardContent>
        </Card>

        {/* Recent Simulations */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Simulations</CardTitle>
                <CardDescription>Your latest thermal analysis projects</CardDescription>
              </div>
              {userData && (
                <div className="text-sm text-muted-foreground">
                  Available Credits: €{userData.credits}
                </div>
              )}
            </div>
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
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                              {simulation.filePath}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLoadDesign(simulation.filePath)}
                              disabled={loadDesignMutation.isPending}
                              className="flex items-center gap-1"
                            >
                              <FolderOpen className="h-3 w-3" />
                              Load
                            </Button>
                          </div>
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
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => handleDeleteSimulation(simulation.id, simulation.name)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
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

      {/* Delete Simulation Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Simulation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDialog.simulationName}"? This action cannot be undone. 
              All simulation data and files will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteSimulationMutation.isPending}
            >
              {deleteSimulationMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}