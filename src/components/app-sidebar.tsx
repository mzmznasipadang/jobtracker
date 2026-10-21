"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { InboxIcon, LayoutDashboardIcon, LogOutIcon, MenuIcon, PlusIcon, SettingsIcon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/app/new", label: "New job", icon: PlusIcon },
  { href: "/app/jobs", label: "Jobs", icon: TableIcon },
  { href: "/app/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
];

// Navy in both themes (--primary turns sky in dark mode), so the sidebar keeps the brand surface.
function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-6 bg-[#272660] p-4 text-white">
      <Link href="/app" onClick={onNavigate} className="mx-2 mt-2 self-start rounded-sm py-2 text-2xl font-semibold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#49bce9]">JobTracker</Link>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#49bce9]",
                active && "bg-white/15 shadow-[inset_3px_0_0_#49bce9]",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <form action={logout}>
        <Button type="submit" variant="ghost" className="w-full justify-start gap-3 px-3 text-white hover:bg-white/10 hover:text-white">
          <LogOutIcon className="size-4" aria-hidden />
          Log out
        </Button>
      </form>
    </div>
  );
}

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">
        <Nav />
      </aside>
      <header className="flex items-center justify-between bg-[#272660] px-4 py-2 text-white md:hidden">
        <Link href="/app" className="rounded-sm py-2 text-xl font-semibold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#49bce9]">JobTracker</Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Open menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" showCloseButton={false} className="w-64 gap-0 border-0 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Nav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
