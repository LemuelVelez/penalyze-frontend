import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const progressValue = Math.min(
    100,
    Math.max(0, Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0),
  );

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={progressValue}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${100 - progressValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };