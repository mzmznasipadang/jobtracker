import { login } from "./actions";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  wrong: "Wrong password",
  limited: "Too many attempts, try again later",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={login} className="flex w-full max-w-xs flex-col gap-4">
        <Wordmark className="mx-auto mb-4 h-20 text-primary dark:text-foreground" />
        <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" autoFocus required aria-invalid={!!message} />
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <Button type="submit">Sign in</Button>
      </form>
    </main>
  );
}
