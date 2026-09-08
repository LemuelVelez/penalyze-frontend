import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FilePickerProps = {
  accept?: string;
  disabled?: boolean;
  multiple?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  buttonLabel?: string;
  className?: string;
};

export function FilePicker({
  accept,
  disabled = false,
  multiple = false,
  onChange,
  buttonLabel = "Choose file",
  className,
}: FilePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className={cn("w-full", className)}>
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        multiple={multiple}
        onChange={onChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="min-h-12 w-full rounded-2xl font-black"
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
