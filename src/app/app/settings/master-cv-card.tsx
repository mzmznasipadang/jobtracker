"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MasterCv } from "@/lib/types";
import { parseMasterCv, saveMasterCvAction } from "./actions";

const skillsText = (cv: MasterCv) => cv.skills.map((s) => s.name).join(", ");

export function MasterCvCard({ initial }: { initial: MasterCv | null }) {
  const [cv, setCv] = useState(initial);
  const [skills, setSkills] = useState(initial ? skillsText(initial) : "");
  const [parsing, startParse] = useTransition();
  const [saving, startSave] = useTransition();

  const setBullet = (ei: number, bi: number, text: string) =>
    setCv((c) => c && { ...c, experience: c.experience.map((e, i) => i !== ei ? e : { ...e, bullets: e.bullets.map((b, j) => j !== bi ? b : { ...b, text }) }) });

  function save() {
    if (!cv) return;
    // Surviving skills keep their category; new ones get none.
    const category = new Map(cv.skills.map((s) => [s.name.toLowerCase(), s.category]));
    const next = skills.split(",").map((s) => s.trim()).filter(Boolean)
      .map((name, i) => ({ id: `skill-${i + 1}`, name, category: category.get(name.toLowerCase()) ?? "" }));
    startSave(async () => {
      const r = await saveMasterCvAction({ ...cv, skills: next });
      if (r.ok) toast.success("Master CV saved");
      else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Master CV</CardTitle>
        <CardDescription>The single source of truth for tailoring. Upload a PDF (max 10 MB) or paste text; Claude extracts it, then you review and save.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            startParse(async () => {
              const r = await parseMasterCv(data);
              if (!r.ok) return void toast.error(r.error);
              setCv(r.cv);
              setSkills(skillsText(r.cv));
              form.reset();
              toast.success("CV parsed. Review it below, then save.");
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="pdf">PDF</Label>
            <Input id="pdf" name="pdf" type="file" accept="application/pdf" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="text">Or paste CV text</Label>
            <Textarea id="text" name="text" rows={4} />
          </div>
          <Button type="submit" variant="secondary" disabled={parsing} className="w-fit">
            {parsing ? "Parsing…" : cv ? "Parse and replace" : "Parse CV"}
          </Button>
        </form>

        {cv && (
          <div className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="summary">Summary</Label>
              <Textarea id="summary" rows={4} value={cv.summary} onChange={(e) => setCv({ ...cv, summary: e.target.value })} />
            </div>
            {cv.experience.map((e, ei) => (
              <fieldset key={e.id} className="grid gap-2 rounded-lg border p-4">
                <legend className="px-1 text-sm font-semibold">{e.title} · {e.company}</legend>
                <p className="text-sm text-muted-foreground">{e.start} – {e.end ?? "present"}{e.location ? ` · ${e.location}` : ""}</p>
                {e.bullets.map((b, bi) => (
                  <Textarea key={b.id} aria-label={`${e.company} bullet ${bi + 1}`} rows={2} value={b.text} onChange={(ev) => setBullet(ei, bi, ev.target.value)} />
                ))}
              </fieldset>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
            </div>
          </div>
        )}
      </CardContent>
      {cv && (
        <CardFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save master CV"}</Button>
        </CardFooter>
      )}
    </Card>
  );
}
