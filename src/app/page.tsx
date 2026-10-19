import { getOwnerAccount } from "@/lib/accounts";
import { MetricsTable, Rate, notEnoughData } from "@/components/metrics-table";
import { WeeklyBars } from "@/components/weekly-bars";
import { Wordmark } from "@/components/wordmark";
import { computeMetrics, type Rates } from "@/lib/metrics";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic"; // numbers come from the DB at request time

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-4xl font-semibold text-card-foreground">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function PublicResults() {
  const account = getOwnerAccount();
  const { publicPageEnabled, pipeline } = getSettings(account);
  const stats = publicPageEnabled ? computeMetrics(account) : null;
  const days = pipeline.ghostDays;
  const rateTile = (label: string, key: keyof Rates) => (
    <Tile label={label} value={<Rate value={stats!.totals[key]} ghostDays={days} />} note={stats!.totals[key] == null ? notEnoughData(days) : undefined} />
  );

  return (
    <>
      <header className="bg-[#272660] text-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark className="h-14 w-auto self-start text-white" />
          <div className="sm:text-right">
            <h1 className="text-2xl font-semibold">Job search results</h1>
            {stats && (
              <p className="text-sm text-white/80">
                Last updated {new Date(stats.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 py-8">
        {!stats ? (
          <p className="py-16 text-center text-lg text-muted-foreground">This page is private.</p>
        ) : (
          <>
            <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Applications sent" value={stats.totals.sent} />
              {rateTile("Response rate", "responseRate")}
              {rateTile("Interview rate", "interviewRate")}
              {rateTile("Ghost rate", "ghostRate")}
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">By source</h2>
              <MetricsTable sources={stats.sources} ghostDays={days} />
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">Applications sent per week</h2>
              <WeeklyBars weekly={stats.weekly} />
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">© Naspad Studio</footer>
    </>
  );
}
