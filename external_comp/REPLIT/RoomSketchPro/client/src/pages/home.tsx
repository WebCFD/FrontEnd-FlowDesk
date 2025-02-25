import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Editor2D from "@/components/Editor2D";
import Preview3D from "@/components/Preview3D";
import ToolPanel from "@/components/ToolPanel";
import { useRoomEditor } from "@/hooks/useRoomEditor";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const editor = useRoomEditor();
  const { toast } = useToast();

  const handleTabChange = (value: string) => {
    if (value === "3d" && !editor.isClosedContour()) {
      toast({
        variant: "destructive",
        title: "Invalid Room Layout",
        description: "Please ensure all walls are connected to form a closed room before viewing in 3D.",
        duration: 5000
      });
      return false; // Prevent tab change
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-6">Room Designer</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-1 p-4">
            <ToolPanel editor={editor} />
          </Card>

          <Card className="md:col-span-3 p-4">
            <Tabs defaultValue="2d" className="w-full" onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="2d">2D Editor</TabsTrigger>
                <TabsTrigger value="3d">3D Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="2d">
                <Editor2D editor={editor} />
              </TabsContent>

              <TabsContent value="3d">
                {editor.isClosedContour() && <Preview3D editor={editor} />}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}