import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Play, Mail, MoreHorizontal, ExternalLink, Trash2, FolderOpen, Server, Home, Flame, Snowflake, X, BarChart3 } from "lucide-react";
import LoginModal from "@/components/auth/login-modal";
import RegisterModal from "@/components/auth/register-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showCFDSelector, setShowCFDSelector] = useState(false);
  const [showExpertDialog, setShowExpertDialog] = useState(false);
  const [expertForm, setExpertForm] = useState({ name: "", email: "", message: "" });
  const { reset } = useRoomStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const expertMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; message: string }) => {
      const res = await apiRequest("POST", "/api/contact", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Message sent!", description: "Our experts will get back to you soon." });
      setShowExpertDialog(false);
      setExpertForm({ name: "", email: "", message: "" });
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again later.", variant: "destructive" });
    },
  });

  // Execute pending action when user logs in
  useEffect(() => {
    if (user && !user.isAnonymous && pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [user, pendingAction]);

  // Auto-open CFD selector when navigated from sidebar or triggered via event
  useEffect(() => {
    const flag = sessionStorage.getItem('openCFDSelector');
    if (flag === 'true') {
      sessionStorage.removeItem('openCFDSelector');
      setShowCFDSelector(true);
    }
    const handleOpenEvent = () => setShowCFDSelector(true);
    window.addEventListener('openCFDSelector', handleOpenEvent);
    return () => window.removeEventListener('openCFDSelector', handleOpenEvent);
  }, []);

  // Close CFD selector on ESC key
  useEffect(() => {
    if (!showCFDSelector) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCFDSelector(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCFDSelector]);

  // Fetch user simulations
  const { data: simulations = [], isLoading, error } = useQuery<Simulation[]>({
    queryKey: ['/api/simulations'],
    enabled: !!user && !user.isAnonymous,
    refetchInterval: (query) => {
      // Auto-refresh every 5 seconds if there are simulations in progress
      const sims = query.state.data as Simulation[] | undefined;
      const hasInProgress = sims?.some(sim => 
        sim.status === 'pending' || 
        sim.status === 'processing' || 
        sim.status === 'geometry' ||
        sim.status === 'meshing' ||
        sim.status === 'cfd_setup' ||
        sim.status === 'cloud_execution' ||
        sim.status === 'post_processing'
      );
      return hasInProgress ? 5000 : false; // 5 seconds if in progress, disabled otherwise
    },
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
    setShowCFDSelector(true);
  };

  const handleCFDTypeSelect = (cfdType: string) => {
    sessionStorage.setItem('selectedCFDType', cfdType);
    reset();
    setShowCFDSelector(false);
    setLocation("/dashboard/wizard-design");
  };

  const cfdSimulationTypes = [
    {
      id: "data-centers",
      title: "Data Centers",
      description: "Server rooms, network closets, telecom facilities, cooling optimization...",
      icon: Server,
      color: "from-blue-500 to-cyan-500",
      bgHover: "hover:border-blue-400",
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      id: "indoor-spaces",
      title: "Indoor Spaces",
      description: "Offices, homes, waiting rooms, hospitals, ventilation & comfort analysis...",
      icon: Home,
      color: "from-emerald-500 to-teal-500",
      bgHover: "hover:border-emerald-400",
      iconBg: "bg-emerald-50 text-emerald-600",
    },
    {
      id: "fire-smoke",
      title: "Fire & Smoke",
      description: "Smoke propagation, fire containment, evacuation routes, safety compliance...",
      icon: Flame,
      color: "from-orange-500 to-red-500",
      bgHover: "hover:border-orange-400",
      iconBg: "bg-orange-50 text-orange-600",
    },
    {
      id: "industrial-cooling",
      title: "Industrial Cooling",
      description: "Refrigeration systems, cold rooms, food storage, industrial freezers...",
      icon: Snowflake,
      color: "from-violet-500 to-indigo-500",
      bgHover: "hover:border-violet-400",
      iconBg: "bg-violet-50 text-violet-600",
    },
  ];

  const handleHowItWorks = () => {
    setIsVideoOpen(true);
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

  // Sample case mutation
  const createSampleSimulationMutation = useMutation({
    mutationFn: async (sampleCaseId: string) => {
      return apiRequest("POST", "/api/simulations/sample", { sampleCaseId });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/simulations'] });
      toast({
        title: "Sample Case Loaded",
        description: data.message || "Sample simulation created successfully and ready for analysis.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Load Sample",
        description: error.message || "Failed to create sample simulation.",
        variant: "destructive",
      });
    },
  });

  const handleLoadSampleCase = () => {
    // Check authentication first
    if (!user || user.isAnonymous) {
      // Store the action to execute after login
      setPendingAction(() => () => createSampleSimulationMutation.mutate("office-layout"));
      toast({
        title: "Login Required",
        description: "Please log in to load sample cases and create simulations.",
        variant: "destructive",
      });
      setShowAuthDialog(true);
      return;
    }

    // Load the office layout sample case
    createSampleSimulationMutation.mutate("office-layout");
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
              onClick={handleLoadSampleCase}
              className="flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Load Sample Case
            </Button>
            <Button 
              variant="outline" 
              onClick={handleHowItWorks}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              How it Works
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowExpertDialog(true)}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Ask Expert Advice
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
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              {simulation.name}
                              {simulation.isPublic && (
                                <Badge variant="secondary" className="text-xs">
                                  Public
                                </Badge>
                              )}
                              {simulation.simulationType === "test_calculation" && (
                                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                  Test
                                </Badge>
                              )}
                            </div>
                            {simulation.simulationType === "test_calculation" && simulation.status === "completed" && simulation.result && (
                              <div className="text-sm text-green-600 font-mono mt-1">
                                {typeof simulation.result === 'object' && 'calculatedValue' in simulation.result && (
                                  <>
                                    {simulation.result.formula} = {simulation.result.calculatedValue}
                                  </>
                                )}
                              </div>
                            )}
                            {simulation.simulationType === "test_calculation" && simulation.status === "failed" && simulation.result && (
                              <div className="text-sm text-red-600 mt-1">
                                {typeof simulation.result === 'object' && 'error' in simulation.result && (
                                  <>Error: {simulation.result.error}</>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {simulation.simulationType === "test_calculation" ? (
                            <div className="text-sm text-muted-foreground">
                              Test calculation
                            </div>
                          ) : (
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
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              simulation.status === "pending" ? "outline" :
                              simulation.status === "processing" ? "default" :
                              simulation.status === "completed" ? "secondary" :
                              "destructive"
                            }
                            className={
                              simulation.status === "pending" ? "bg-gray-50 text-gray-700 border-gray-200" :
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
                          <div className="flex items-center justify-end gap-2">
                            {simulation.status === "completed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocation(`/dashboard/analysis/${simulation.id}`)}
                                className="flex items-center gap-1 text-primary border-primary/30 hover:bg-primary/5"
                              >
                                <BarChart3 className="h-3.5 w-3.5" />
                                Post & Analysis
                              </Button>
                            )}
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
                          </div>
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

      {/* Authentication Selection Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Please log in or create an account to load sample cases and create simulations.
            </p>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 mt-6">
            <Button 
              onClick={() => {
                setShowAuthDialog(false);
                setIsLoginOpen(true);
              }}
              className="w-full"
            >
              Log In
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setShowAuthDialog(false);
                setIsRegisterOpen(true);
              }}
              className="w-full"
            >
              Sign Up
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />

      {showCFDSelector && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ animation: 'fadeIn 0.25s ease-out' }}
        >
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCFDSelector(false)}
          />
          <div className="relative z-10 w-full max-w-3xl mx-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Select Simulation Type</h2>
                <p className="text-sm text-white/70 mt-1">Choose the type of CFD analysis for your project</p>
              </div>
              <button
                onClick={() => setShowCFDSelector(false)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cfdSimulationTypes.map((type) => {
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleCFDTypeSelect(type.id)}
                    className={`group relative bg-white rounded-xl border-2 border-transparent ${type.bgHover} p-6 text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
                  >
                    <div className="flex flex-col items-center text-center gap-4">
                      <h3 className="text-lg font-semibold text-gray-900">{type.title}</h3>
                      <div className={`w-20 h-20 rounded-2xl ${type.iconBg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                        <IconComponent className="h-10 w-10" />
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{type.description}</p>
                    </div>
                    <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-xl bg-gradient-to-r ${type.color} opacity-0 group-hover:opacity-100 transition-opacity duration-200`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showExpertDialog} onOpenChange={setShowExpertDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ask Expert Advice</DialogTitle>
            <DialogDescription>Send a message to our HVAC/CFD experts. We'll get back to you as soon as possible.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              expertMutation.mutate(expertForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="expert-name">Name</Label>
              <Input
                id="expert-name"
                placeholder="Your name"
                value={expertForm.name}
                onChange={(e) => setExpertForm((prev) => ({ ...prev, name: e.target.value }))}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expert-email">Email</Label>
              <Input
                id="expert-email"
                type="email"
                placeholder="your@email.com"
                value={expertForm.email}
                onChange={(e) => setExpertForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expert-message">Message</Label>
              <Textarea
                id="expert-message"
                placeholder="Describe what you need help with..."
                value={expertForm.message}
                onChange={(e) => setExpertForm((prev) => ({ ...prev, message: e.target.value }))}
                required
                minLength={10}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowExpertDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={expertMutation.isPending}>
                {expertMutation.isPending ? "Sending..." : "Send Message"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </DashboardLayout>
  );
}