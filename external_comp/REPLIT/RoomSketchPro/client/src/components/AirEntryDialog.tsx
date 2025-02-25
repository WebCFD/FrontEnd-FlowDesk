import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { DoorWindow } from "@shared/schema";

const doorSchema = z.object({
  width: z.number().min(40, "Door width must be at least 40cm").max(200, "Door width cannot exceed 200cm"),
  height: z.number().min(180, "Door height must be at least 180cm").max(300, "Door height cannot exceed 300cm")
});

const windowSchema = z.object({
  width: z.number().min(30, "Window width must be at least 30cm").max(300, "Window width cannot exceed 300cm"),
  height: z.number().min(30, "Window height must be at least 30cm").max(300, "Window height cannot exceed 300cm"),
  zPosition: z.number().min(50, "Window must be at least 50cm from floor").max(250, "Window cannot be higher than 250cm from floor")
});

const gridSchema = z.object({
  width: z.number().min(10, "Grid width must be at least 10cm").max(100, "Grid width cannot exceed 100cm"),
  height: z.number().min(10, "Grid height must be at least 10cm").max(100, "Grid height cannot exceed 100cm"),
  zPosition: z.number().min(0, "Grid position must be at least 0cm from floor").max(300, "Grid cannot be higher than 300cm from floor")
});

interface AirEntryDialogProps {
  type: 'door' | 'window' | 'grid';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: DoorWindow) => void;
  position: { x: number; y: number };
  rotation: number;
}

export default function AirEntryDialog({ type, isOpen, onClose, onConfirm, position, rotation }: AirEntryDialogProps) {
  const schema = type === 'door' ? doorSchema : type === 'window' ? windowSchema : gridSchema;
  type FormData = z.infer<typeof schema>;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      width: type === 'door' ? 50 : type === 'window' ? 50 : 50,
      height: type === 'door' ? 180 : type === 'window' ? 50 : 50,
      ...(type !== 'door' && { zPosition: type === 'window' ? 120 : 120 })
    }
  });

  const onSubmit = (data: FormData) => {
    onConfirm({
      type,
      position,
      rotation,
      width: data.width,
      height: data.height,
      zPosition: type === 'door' ? 0 : (data as any).zPosition
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {type.charAt(0).toUpperCase() + type.slice(1)} Dimensions</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="width"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Width (cm)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="height"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Height (cm)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {type !== 'door' && (
              <FormField
                control={form.control}
                name="zPosition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Height from Floor (cm)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit">Confirm</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}