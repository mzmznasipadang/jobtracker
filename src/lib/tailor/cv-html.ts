import type { TailoredCv } from "./guard";

const T = {
  en: { summary: "Summary", skills: "Skills", experience: "Experience", projects: "Projects", education: "Education", certifications: "Certifications", languages: "Languages", present: "Present" },
  id: { summary: "Ringkasan", skills: "Keahlian", experience: "Pengalaman", projects: "Proyek", education: "Pendidikan", certifications: "Sertifikasi", languages: "Bahasa", present: "Sekarang" },
};

const ENT: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]);
const ul = (bs: { text: string }[]) => (bs.length ? `<ul>${bs.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : "");
const line = (...parts: (string | null | undefined)[]) => esc(parts.filter(Boolean).join(" | "));

// Single column, real text only: no tables, columns or icons, so ATS parsers read it in order.
export function renderCvHtml(cv: TailoredCv, lang: "en" | "id"): string {
  const t = T[lang];
  const section = (title: string, body: string) => (body ? `<section><h2>${title}</h2>${body}</section>` : "");

  const skillGroups = new Map<string, string[]>();
  for (const s of cv.skills) skillGroups.set(s.category, [...(skillGroups.get(s.category) ?? []), s.name]);
  const skills = [...skillGroups].map(([cat, names]) => `<p>${cat ? `<b>${esc(cat)}:</b> ` : ""}${esc(names.join(", "))}</p>`).join("");

  const experience = cv.experience.map((e) =>
    `<div class="item"><h3>${esc(e.title)}, ${esc(e.company)}</h3><p class="meta">${line(`${e.start} - ${e.end ?? t.present}`, e.location)}</p>${ul(e.bullets)}</div>`).join("");
  const projects = cv.projects.map((p) =>
    `<div class="item"><h3>${esc(p.name)}</h3>${p.description ? `<p class="meta">${esc(p.description)}</p>` : ""}${ul(p.bullets)}</div>`).join("");
  const education = cv.education.map((e) =>
    `<div class="item"><h3>${esc(e.degree)}, ${esc(e.school)}</h3><p class="meta">${esc(`${e.start} - ${e.end}`)}</p></div>`).join("");
  const certs = cv.certifications.map((c) => `<p>${line(c.name, c.issuer, c.year)}</p>`).join("");

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${esc(cv.basics.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{font-family:Montserrat,Arial,sans-serif;font-size:10pt;line-height:1.4;color:#000;margin:0}
h1{font-size:20pt;margin:0 0 2pt;color:#272660}
h2{font-size:11pt;text-transform:uppercase;letter-spacing:.04em;color:#272660;border-bottom:1px solid #272660;margin:14pt 0 6pt;padding-bottom:2pt}
h3{font-size:10pt;margin:8pt 0 0}
p{margin:2pt 0}.meta{color:#333}
ul{margin:3pt 0 0;padding-left:16pt}li{margin:1.5pt 0}
.item{break-inside:avoid-page}
</style></head><body>
<h1>${esc(cv.basics.name)}</h1>
<p>${line(cv.basics.email, cv.basics.phone, cv.basics.location, ...cv.basics.links)}</p>
${section(t.summary, cv.summary ? `<p>${esc(cv.summary)}</p>` : "")}
${section(t.skills, skills)}
${section(t.experience, experience)}
${section(t.projects, projects)}
${section(t.education, education)}
${section(t.certifications, certs)}
${section(t.languages, cv.languages.length ? `<p>${esc(cv.languages.join(", "))}</p>` : "")}
</body></html>`;
}

export function renderCoverLetterHtml(basics: TailoredCv['basics'], letter: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(basics.name)} — Cover letter</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{font-family:Montserrat,Arial,sans-serif;font-size:10pt;line-height:1.6;color:#000;margin:0}
h1{font-size:20pt;margin:0 0 2pt;color:#272660}
.contact{margin:2pt 0 24pt;color:#333;font-size:10pt}
.letter{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}
</style></head><body>
<h1>${esc(basics.name)}</h1>
<p class="contact">${line(basics.email, basics.phone, basics.location, ...basics.links)}</p>
<div class="letter">${esc(letter)}</div>
</body></html>`;
}
