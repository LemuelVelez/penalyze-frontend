import { Loader2 } from "lucide-react";

type LoadingProps = {
  label?: string;
};

export default function Loading(props: LoadingProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="flex w-full max-w-sm flex-col items-center rounded-3xl border bg-card p-8 text-center shadow-sm">
        <img
          src="/logo.svg"
          alt="Penalyze logo"
          className="size-16 rounded-2xl object-contain"
        />
        <h1 className="mt-4 text-2xl font-black tracking-tight">Penalyze</h1>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm font-bold text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span>{props.label ?? "Loading..."}</span>
        </div>
      </section>
    </main>
  );
}