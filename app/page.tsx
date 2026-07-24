import NfcApp from "@/components/NfcApp";

// Public website. Always the customer experience — there is no owner entry
// point, toggle or link here. The dashboard lives at /dashboard only.
export default function Page() {
  return <NfcApp mode="client" />;
}
