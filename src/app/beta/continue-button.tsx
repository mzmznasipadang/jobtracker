"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ContinueButton() {
  const navigating = useRef(false);
  const [pending, setPending] = useState(false);
  return (
    <form action="/api/auth/google" method="get" onSubmit={event => {
      if (navigating.current) { event.preventDefault(); return; }
      navigating.current = true;
      setPending(true);
    }}>
      <input type="hidden" name="next" value="/app" />
      <input type="hidden" name="returnTo" value="/beta" />
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto sm:px-8" disabled={pending}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      <span role="status" className="sr-only">{pending ? "Opening Google sign-in" : ""}</span>
    </form>
  );
}
