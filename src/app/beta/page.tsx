import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { isOpenBetaEnabled } from "@/lib/beta";
import { lookupSession, SESSION_COOKIE } from "@/lib/sessions";
import { ContinueButton } from "./continue-button";

export const metadata: Metadata = {
  title: "JobTracker beta",
  description: "Keep your applications, interview updates, and next steps in one place. Try the JobTracker beta.",
};

export default async function BetaPage({ searchParams }: PageProps<"/beta">) {
  const { error } = await searchParams;
  const account = lookupSession((await cookies()).get(SESSION_COOKIE)?.value);
  const open = isOpenBetaEnabled();
  const message = error === "cancelled"
    ? "Sign-in wasn’t completed. You can try again."
    : error === "google" ? "We couldn’t sign you in. Please try again or contact hello@naspadstudio.id." : null;

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-accent selection:text-accent-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <Wordmark className="h-10 w-auto max-w-full text-primary" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-20">
        <div className="max-w-[640px]">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-primary sm:text-5xl">
            Your job search,<br className="hidden sm:block" /> a little more organised.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-foreground sm:text-lg">
            Keep your applications, interview updates, and next steps in one place.
            {open ? "Join the JobTracker open beta and help shape what comes next." : "The JobTracker beta is currently invite-only. Approved testers can sign in below."}
          </p>

          <section aria-label="Join the beta" className="mt-9">
            {message && <p role="alert" className="mb-5 max-w-xl rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-foreground">{message}</p>}
            {account ? (
              <Button asChild size="lg" className="h-12 w-full sm:w-auto sm:px-8"><a href="/app">Open your tracker</a></Button>
            ) : open ? (
              <>
                <ContinueButton />
                <p className="mt-3 text-sm leading-6 text-muted-foreground">No invitation code needed. Connecting Gmail is optional.</p>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">By continuing, you agree to the <a href="/terms" className="underline underline-offset-4">Terms of Service</a> and acknowledge the <a href="/privacy" className="underline underline-offset-4">Privacy Policy</a>.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">The beta is invite-only</h2>
                <p className="mt-2 mb-5 text-sm leading-6 text-muted-foreground">Sign in with your approved Google account. To request access, email hello@naspadstudio.id.</p>
                <Button asChild size="lg"><a href="/login">Sign in to your account</a></Button>
              </>
            )}
          </section>

          <section aria-labelledby="beta-expectations" className="mt-12 border-t border-border pt-8">
            <h2 id="beta-expectations" className="text-lg font-semibold text-primary">An early version, shaped with you.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              You may find a few rough edges, and features may change as the beta grows.
              If something breaks, feels confusing, or seems missing, <a href="mailto:hello@naspadstudio.id" className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">send me your feedback</a>.
            </p>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              Google sign-in uses your basic profile and email address. Gmail access is requested separately if you choose to connect it.
              For privacy questions or a data deletion request, contact <a href="mailto:hello@naspadstudio.id" className="break-all rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">hello@naspadstudio.id</a>.
            </p>
          </section>
        </div>
      </main>
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-3 text-xs leading-6 text-muted-foreground">
          <span>JobTracker · Naspad Studio</span>
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            <a href="/terms" className="underline underline-offset-4">Terms</a>
            <a href="/privacy" className="underline underline-offset-4">Privacy</a>
          </nav>
          <a href="mailto:hello@naspadstudio.id" className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Get in touch</a>
        </div>
      </footer>
    </div>
  );
}
