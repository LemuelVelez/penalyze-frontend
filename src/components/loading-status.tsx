import { CheckCircle2, Circle, Loader2 } from "lucide-react";

import { Progress } from "./ui/progress";

export type LoadingStatusStep = {
  label: string;
  status: "pending" | "loading" | "done";
  detail?: string;
};

type LoadingStatusProps = {
  title: string;
  detail: string;
  progress: number;
  steps?: LoadingStatusStep[];
  className?: string;
};

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function LoadingStatus(props: LoadingStatusProps) {
  const progress = clampProgress(props.progress);

  return (
    <div
      className={`rounded-2xl border bg-background p-4 shadow-sm ${props.className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black">{props.title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
            {props.detail}
          </p>
        </div>
        <p className="shrink-0 text-lg font-black">{Math.round(progress)}%</p>
      </div>

      <Progress value={progress} className="mt-3 h-2.5 rounded-full" />

      {props.steps?.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {props.steps.map((step) => (
            <div
              key={step.label}
              className="flex min-w-0 items-start gap-2 rounded-xl border bg-muted/20 px-3 py-2"
            >
              {step.status === "done" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : step.status === "loading" ? (
                <Loader2
                  className="mt-0.5 size-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{step.label}</p>
                {step.detail ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold text-muted-foreground">
                    {step.detail}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
