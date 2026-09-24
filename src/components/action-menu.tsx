import { useState } from "react";
import type { ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { ProtectedDeleteDialog } from "./protected-delete-dialog";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export type ActionMenuItem = {
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

export type ActionMenuDeleteItem = {
  label?: ReactNode;
  disabled?: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmationPhrase?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  isPending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
};

type ActionMenuProps = {
  actions?: ActionMenuItem[];
  deleteAction?: ActionMenuDeleteItem;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
  className?: string;
};

export function ActionMenu({
  actions = [],
  deleteAction,
  ariaLabel = "Actions",
  align = "end",
  className,
}: ActionMenuProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const hasEnabledAction = actions.some((action) => !action.disabled);
  const deleteEnabled = Boolean(deleteAction && !deleteAction.disabled);
  const triggerDisabled = !hasEnabledAction && !deleteEnabled;

  return (
    <>
      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={triggerDisabled}
            aria-label={ariaLabel}
            className={cn("rounded-xl", className)}
          >
            <EllipsisVertical className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuPrimitive.Trigger>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align={align}
            sideOffset={6}
            className="z-50 min-w-40 rounded-xl border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {actions.map((action, index) => (
              <DropdownMenuPrimitive.Item
                key={index}
                disabled={action.disabled}
                onSelect={() => action.onSelect()}
                className="flex cursor-default select-none items-center rounded-lg px-2.5 py-2 text-sm font-semibold outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
              >
                {action.label}
              </DropdownMenuPrimitive.Item>
            ))}

            {actions.length && deleteAction ? (
              <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />
            ) : null}

            {deleteAction ? (
              <DropdownMenuPrimitive.Item
                disabled={deleteAction.disabled}
                onSelect={() => setDeleteDialogOpen(true)}
                className="flex cursor-default select-none items-center rounded-lg px-2.5 py-2 text-sm font-semibold text-destructive outline-none focus:bg-destructive/10 focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50"
              >
                {deleteAction.label ?? "Delete"}
              </DropdownMenuPrimitive.Item>
            ) : null}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>

      {deleteAction ? (
        <ProtectedDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={deleteAction.title}
          description={deleteAction.description}
          confirmationPhrase={deleteAction.confirmationPhrase}
          confirmLabel={deleteAction.confirmLabel}
          pendingLabel={deleteAction.pendingLabel}
          isPending={deleteAction.isPending}
          confirmDisabled={deleteAction.confirmDisabled}
          onConfirm={deleteAction.onConfirm}
        />
      ) : null}
    </>
  );
}
