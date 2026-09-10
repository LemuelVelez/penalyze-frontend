import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";

type ProtectedDeleteDialogProps = {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  onConfirm: () => void | Promise<void>;
  confirmationPhrase?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  isPending?: boolean;
  confirmDisabled?: boolean;
  contentClassName?: string;
};

export function ProtectedDeleteDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmationPhrase = "DELETE",
  confirmLabel = "Delete",
  pendingLabel = "Deleting...",
  isPending = false,
  confirmDisabled = false,
  contentClassName = "rounded-3xl",
}: ProtectedDeleteDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const expectedConfirmation = confirmationPhrase.trim().toUpperCase();
  const isConfirmed =
    confirmation.trim().toUpperCase() === expectedConfirmation;

  useEffect(() => {
    if (open === false) {
      setConfirmation("");
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmation("");
    }
    onOpenChange?.(nextOpen);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent className={contentClassName}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <div>{description}</div>
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-foreground">
                <p className="text-sm font-semibold">
                  Accidental-delete protection is enabled. Type{" "}
                  <span className="font-black">{confirmationPhrase}</span> to unlock
                  this action.
                </p>
                <Input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={isPending}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`Type ${confirmationPhrase} to confirm deletion`}
                  placeholder={confirmationPhrase}
                  className="mt-3"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || confirmDisabled || !isConfirmed}
            onClick={() => void onConfirm()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
