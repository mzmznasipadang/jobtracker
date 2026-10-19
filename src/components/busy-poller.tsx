"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Background work (extraction, checks, tailoring) finishes outside the request: refresh until it does.
export function BusyPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
