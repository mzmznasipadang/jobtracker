import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { privacyPolicy } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · JobTracker", description: "How JobTracker collects, uses, shares, and deletes personal information." };

export default function PrivacyPage() {
  return <LegalDocument document={privacyPolicy} />;
}
