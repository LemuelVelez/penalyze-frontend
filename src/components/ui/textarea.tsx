import * as React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm ring-offset-background transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";