import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Play, Mail, FileEdit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRoomStore } from "@/lib/store/room-store";
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

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [simulations] = useState([
    { id: 1, name: 'tutorial', status: 'Draft' }
  ]);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [showNewSimulationDialog, setShowNewSimulationDialog] = useState(false);
  const { lines, reset } = useRoomStore();

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

        {/* Latest Simulations */}
        <Card>
          <CardHeader>
            <CardTitle>Latest Simulations</CardTitle>
          </CardHeader>
          <CardContent>
            {simulations.length > 0 ? (
              <div className="space-y-4">
                {simulations.map((simulation) => (
                  <div 
                    key={simulation.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => console.log(`Opening simulation ${simulation.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <FileEdit className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{simulation.name}</div>
                        <div className="text-sm text-muted-foreground">{simulation.status}</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">Open</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No simulations yet. Start your first simulation!
              </div>
            )}
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