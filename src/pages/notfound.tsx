import { LogoMark, navigateTo } from "../components/layout";
import { Button } from "../components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10 text-foreground sm:px-6">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-6 text-center shadow-xl shadow-black/5 sm:p-8">
        <div className="mb-6 flex justify-center">
          <LogoMark textClassName="text-2xl" />
        </div>
        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The page you are trying to open does not exist or may have been moved.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => navigateTo("/")} className="min-h-11 rounded-xl px-5 py-2 text-sm font-black">
            Go to student lookup
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigateTo("/dashboard")}
            className="min-h-11 rounded-xl px-5 py-2 text-sm font-black"
          >
            Go to dashboard
          </Button>
        </div>
      </section>
    </main>
  );
}