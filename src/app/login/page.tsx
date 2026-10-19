import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { safeNext } from "@/lib/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const destination = safeNext(typeof next === "string" ? next : null);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border bg-card p-7">
        <Wordmark className="mx-auto h-20 text-primary dark:text-foreground" />
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Your next opportunity</h1>
          <p className="text-sm text-muted-foreground">Sign in with an approved Google account. Your CV, jobs and inbox stay private.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">Could not sign you in. Use an approved account or ask the owner for access.</p>}
        <Button asChild><a href={`/api/auth/google?next=${encodeURIComponent(destination)}`}>Sign in with Google</a></Button>
        <p className="text-center text-xs text-muted-foreground">Connecting Gmail is optional and happens after sign-in.</p>
      </div>
    </main>
  );
}
