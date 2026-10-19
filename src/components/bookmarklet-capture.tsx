"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { captureAction } from "@/app/app/new/actions";
import { splitPasted } from "@/lib/bookmarklet";

// The capture form. On /app/new?via=bm it also tells the opener (the bookmarklet) it is ready and
// fills the fields from the reply; the user still presses Capture.
export function BookmarkletCapture({ viaBookmarklet }: { viaBookmarklet: boolean }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(viaBookmarklet);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!viaBookmarklet || !window.opener) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.opener || e.data?.type !== "jobtracker-capture") return;
      setUrl(String(e.data.url ?? ""));
      setText(String(e.data.text ?? ""));
      setShowText(true);
      setWaiting(false);
    };
    window.addEventListener("message", onMessage);
    window.opener.postMessage({ type: "jobtracker-ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [viaBookmarklet]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await captureAction({ url, text });
      if (!r) return; // success redirects
      setError(r.error);
      if (r.needsText) setShowText(true);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {waiting && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Waiting for the job page. If nothing arrives in a few seconds, paste (⌘V) the copied job into the box below.
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="url">Job URL</Label>
        <Input id="url" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      </div>
      {showText ? (
        <div className="grid gap-1.5">
          <Label htmlFor="text">Job description</Label>
          <Textarea
            id="text"
            rows={10}
            placeholder="Paste here (⌘V)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              // A bookmarklet clipboard paste starts with the URL: move it into the URL field.
              const { url: u, text: t } = splitPasted(e.clipboardData.getData("text"));
              if (url.trim() || !u || text) return;
              e.preventDefault();
              setUrl(u);
              setText(t);
            }}
          />
        </div>
      ) : (
        <Button type="button" variant="link" className="w-fit px-0" onClick={() => setShowText(true)}>Paste job description instead</Button>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">{pending ? "Capturing…" : "Capture"}</Button>
    </form>
  );
}
