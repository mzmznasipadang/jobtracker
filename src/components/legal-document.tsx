import { Wordmark } from "@/components/wordmark";
import { legalUpdatedAt, type LegalDocument as Document } from "@/lib/legal";

export function LegalDocument({ document }: { document: Document }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <a href="/beta" aria-label="JobTracker beta" className="rounded-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"><Wordmark className="h-10 w-auto" /></a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">{document.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {legalUpdatedAt}</p>
        <p className="mt-8 text-base leading-8">{document.introduction}</p>
        {document.sections.map(section => (
          <section key={section.title} className="mt-10">
            <h2 className="text-xl font-semibold text-primary">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-4 text-sm leading-7 text-foreground">{paragraph}</p>)}
          </section>
        ))}
        <p className="mt-10 border-t border-border pt-6 text-sm leading-7">Questions? <a href="mailto:hello@naspadstudio.id" className="break-all rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">hello@naspadstudio.id</a></p>
      </main>
      <footer className="border-t border-border px-6 py-6">
        <nav aria-label="Legal" className="mx-auto flex max-w-3xl flex-wrap gap-6 text-sm text-muted-foreground">
          <a href="/beta" className="underline underline-offset-4">JobTracker</a>
          <a href="/terms" className="underline underline-offset-4">Terms of Service</a>
          <a href="/privacy" className="underline underline-offset-4">Privacy Policy</a>
        </nav>
      </footer>
    </div>
  );
}
