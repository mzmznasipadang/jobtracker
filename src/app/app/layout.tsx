import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  await requireSession();
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppSidebar />
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      <Toaster />
    </div>
  );
}
