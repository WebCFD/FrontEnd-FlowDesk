import { useState } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Play, Mail, FileEdit } from "lucide-react";

export default function Dashboard() {
  const [simulations] = useState([
    { id: 1, name: 'tutorial', status: 'Draft' }
  ]);

  const handleStartSimulation = () => {
    // TODO: Implement new simulation functionality
    console.log("Starting new simulation");
  };

  const handleHowItWorks = () => {
    // TODO: Add the actual video URL
    window.open("https://your-video-url.com", "_blank");
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
            <CardTitle>Welcome to AirShaper</CardTitle>
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
    </DashboardLayout>
  );
}