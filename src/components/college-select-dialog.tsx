import { useEffect, useState } from "react";

import { QR_CODE_COLLEGE_OPTIONS } from "../lib/colleges";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type CollegeSelectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  initialCollege?: string;
  onConfirm: (college: string) => void;
};

export function CollegeSelectDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  initialCollege,
  onConfirm,
}: CollegeSelectDialogProps) {
  const [college, setCollege] = useState("");

  useEffect(() => {
    if (open) {
      setCollege(
        initialCollege && QR_CODE_COLLEGE_OPTIONS.includes(initialCollege)
          ? initialCollege
          : "",
      );
    }
  }, [open, initialCollege]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Select value={college} onValueChange={setCollege}>
          <SelectTrigger className="min-h-11 w-full min-w-0">
            <SelectValue placeholder="Select a college" />
          </SelectTrigger>
          <SelectContent>
            {QR_CODE_COLLEGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!college}
            onClick={() => {
              if (!college) return;
              onConfirm(college);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
