import * as React from "react";

import { Button } from "@/components/ui/button";
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
    <div className={cn("relative w-full min-w-0 max-w-full", className)}>
      <input
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
        className="min-h-12 h-auto w-full min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] rounded-2xl py-2 font-black"
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
