"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function SectionForm({ action, title, description, children }: {
  action: (f: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(async () => {
            const r = await action(data);
            if (r.ok) toast.success(`${title} saved`);
            else toast.error(r.error);
          });
        }}
        className="contents"
      >
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
