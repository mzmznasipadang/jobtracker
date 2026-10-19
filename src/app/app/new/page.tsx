import { BookmarkletCapture } from "@/components/bookmarklet-capture";
import { requireSession } from "@/lib/auth";

export default async function NewJobPage({ searchParams }: PageProps<"/app/new">) {
  await requireSession();
  const via = (await searchParams).via === "bm";
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">New job</h1>
        <p className="mt-1 text-sm text-muted-foreground">Paste a job link. It is extracted and checked automatically, then you tailor and apply.</p>
      </div>
      <BookmarkletCapture viaBookmarklet={via} />
    </div>
  );
}
