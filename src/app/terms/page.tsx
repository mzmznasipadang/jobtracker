import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { termsOfService } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service · JobTracker", description: "Terms for using the JobTracker beta, accounts, AI features, and integrations." };

export default function TermsPage() {
  return <LegalDocument document={termsOfService} />;
}
