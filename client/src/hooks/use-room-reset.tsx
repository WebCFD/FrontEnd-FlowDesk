import { useState } from "react";
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
import { useRoomStore } from "@/lib/store/room-store";

export function useRoomReset() {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { reset } = useRoomStore();
  const [onConfirm, setOnConfirm] = useState<() => void>(() => {});

  const confirmReset = (afterReset?: () => void) => {
    setOnConfirm(() => () => {
      reset();
      afterReset?.();
    });
    setShowConfirmation(true);
  };

  const ResetDialog = () => (
    <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear Room Design?</AlertDialogTitle>
          <AlertDialogDescription>
            Your current room design will be lost. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            onConfirm();
            setShowConfirmation(false);
          }}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    confirmReset,
    ResetDialog
  };
}
