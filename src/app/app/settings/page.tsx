import { getAiConfig, providerAvailability } from "@/lib/ai-settings";
import { listSkills, getEffectiveAiSummary } from "@/lib/cv-skills";
import { AiCard } from "./ai-card";
import { SkillsCard } from "./skills-card";
import { listAccounts } from "@/lib/accounts";
import { AccountsCard } from "./accounts-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { bookmarkletHref } from "@/lib/bookmarklet";
import { requireSession } from "@/lib/auth";
import { getCvParseState, getMasterCv } from "@/lib/cv/parse";
import { isSyncing } from "@/lib/email/sync";
import { getKv, getSettings } from "@/lib/settings";
import { saveGeneral, savePipeline, savePreferences, saveProfile, saveSalary } from "./actions";
import { GmailCard } from "./gmail-card";
import { MasterCvCard } from "./master-cv-card";
import { SectionForm } from "./section-form";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const lines = (xs: string[]) => xs.join("\n");

function Field({ label, name, wide, ...props }: { label: string; name: string; wide?: boolean } & React.ComponentProps<typeof Input>) {
  return (
    <div className={`grid gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

function Area({ label, name, hint, defaultValue }: { label: string; name: string; hint: string; defaultValue: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={3} defaultValue={defaultValue} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default async function SettingsPage() {
  const account = await requireSession();
  const s = getSettings(account);
  const cv = getMasterCv(account);
  const aiConfig = getAiConfig();
  const effectiveAi = getEffectiveAiSummary();

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold text-primary">Settings</h1>
      <p className="break-all text-sm text-muted-foreground">Signed in as {account.email}</p>
      {account.role === "owner" && <AccountsCard accounts={listAccounts()} />}

      <SectionForm action={saveProfile} title="Profile" description="Contact details and links used on tailored CVs.">
        <Field label="Name" name="name" defaultValue={s.profile.name} />
        <Field label="Email" name="email" type="email" defaultValue={s.profile.email} />
        <Field label="Phone" name="phone" defaultValue={s.profile.phone} />
        <Area label="Links" name="links" hint="One per line: LinkedIn, GitHub, portfolio." defaultValue={lines(s.profile.links)} />
      </SectionForm>

      <MasterCvCard initial={cv} parse={getCvParseState(account)} />

      <SectionForm action={savePreferences} title="Preferences" description="What you are looking for. One item per line.">
        <Area label="Target roles" name="targetRoles" hint="One per line." defaultValue={lines(s.preferences.targetRoles)} />
        <Field label="Seniority" name="seniority" defaultValue={s.preferences.seniority} />
        <div className="grid gap-2">
          <Label>Work mode</Label>
          {(["remote", "hybrid", "onsite"] as const).map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Switch id={`wm-${m}`} name="workModes" value={m} defaultChecked={s.preferences.workModes.includes(m)} />
              <Label htmlFor={`wm-${m}`} className="capitalize">{m}</Label>
            </div>
          ))}
        </div>
        <Area label="Locations" name="locations" hint="One per line." defaultValue={lines(s.preferences.locations)} />
        <Area label="Employment types" name="employmentTypes" hint="One per line, e.g. full-time, contract." defaultValue={lines(s.preferences.employmentTypes)} />
        <Area label="Deal-breakers" name="dealBreakers" hint="One per line." defaultValue={lines(s.preferences.dealBreakers)} />
      </SectionForm>

      <SectionForm action={saveSalary} title="Salary" description="Used to normalise and compare postings.">
        <Field label="Expected monthly (IDR)" name="expectedMonthlyIdr" type="number" min={0} step="any" defaultValue={s.salary.expectedMonthlyIdr} />
        <Field label="Minimum monthly (IDR)" name="minimumMonthlyIdr" type="number" min={0} step="any" defaultValue={s.salary.minimumMonthlyIdr} />
        <Field label="Expected hourly rate (USD)" name="expectedUsdHourly" type="number" min={0} step="any" defaultValue={s.salary.expectedUsdHourly} />
        <Field label="Hours per month" name="hoursPerMonth" type="number" min={1} step="any" defaultValue={s.salary.hoursPerMonth} />
        <Field label="IDR per USD" name="fxUSD" type="number" min={1} step="any" defaultValue={s.salary.fx.USD} />
        <Field label="IDR per SGD" name="fxSGD" type="number" min={1} step="any" defaultValue={s.salary.fx.SGD} />
        <Field label="IDR per EUR" name="fxEUR" type="number" min={1} step="any" defaultValue={s.salary.fx.EUR} />
      </SectionForm>

      <SectionForm action={savePipeline} title="Pipeline">
        <Field label="Ghosted after (days)" name="ghostDays" type="number" min={1} step={1} defaultValue={s.pipeline.ghostDays} />
        <Field label="Follow up after (days)" name="followUpDays" type="number" min={1} step={1} defaultValue={s.pipeline.followUpDays} />
        <div className="grid gap-1.5">
          <Label htmlFor="cvLanguage">Default CV language</Label>
          <Select name="cvLanguage" defaultValue={s.pipeline.cvLanguage}>
            <SelectTrigger id="cvLanguage" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Match the posting</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="id">Indonesian</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionForm>

      <SectionForm action={saveGeneral} title="General">
        <Field label="Outlook forwarding address" name="outlookAddress" type="email" wide defaultValue={s.outlookAddress ?? ""} />
        <div className="flex items-center gap-2 sm:col-span-2">
          {account.role === "owner" && <>
            <Switch id="publicPageEnabled" name="publicPageEnabled" defaultChecked={s.publicPageEnabled} />
            <Label htmlFor="publicPageEnabled">Show the public results page</Label>
          </>}
        </div>
      </SectionForm>

      {account.role === "owner" ? <>
        <AiCard key={aiConfig.revision} config={aiConfig} available={providerAvailability()} />
        <SkillsCard config={aiConfig} skills={listSkills(account)} />
      </> : <Card><CardHeader><CardTitle>Shared AI configuration</CardTitle><CardDescription>Managed by the owner for everyone.</CardDescription></CardHeader><CardContent className="space-y-1 text-sm"><p>{effectiveAi.provider} · {effectiveAi.model}</p><p>Skills: {effectiveAi.primary}{effectiveAi.additional ? ` + ${effectiveAi.additional}` : ""}</p></CardContent></Card>}
      <GmailCard address={getKv<string>(account, "gmailAddress")} hasToken={getKv(account, "gmailToken") !== null} error={getKv<string>(account, "gmailError")} lastSync={getKv<string>(account, "gmailLastSync")} syncing={isSyncing(account)} />
      <Card>
        <CardHeader>
          <CardTitle>Bookmarklet</CardTitle>
          <CardDescription>Capture a job from your own browser, including sites that block servers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {/* Raw HTML: React blocks javascript: hrefs, which would break dragging this to the bookmarks bar. */}
          <p dangerouslySetInnerHTML={{ __html: `<a href="${escapeAttr(bookmarkletHref(process.env.APP_URL || "http://localhost:3000"))}" class="inline-block rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground" draggable="true">Send to JobTracker</a>` }} />
          <ol className="list-decimal space-y-1 pl-5">
            <li>Drag the button above to your bookmarks bar.</li>
            <li>Open a job posting and click the bookmark. A JobTracker tab opens with the link and text filled in; press Capture.</li>
            <li>If the tab stays empty (some sites block the hand-off), the job is copied to your clipboard after a few seconds: paste it into the box on the capture page.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
