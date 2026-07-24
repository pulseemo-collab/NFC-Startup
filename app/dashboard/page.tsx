import type { Metadata } from "next";
import NfcApp from "@/components/NfcApp";

// Private owner dashboard. Reachable only by typing /dashboard directly —
// it is never linked or hinted at from the public site.
export const metadata: Metadata = {
  title: "Paneli",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <NfcApp />;
}
