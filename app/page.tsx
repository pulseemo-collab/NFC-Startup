import PublicApp from "@/components/public/PublicApp";

// Public website. A separate, leak-free client tree from the owner dashboard:
// it never imports supplier costs, the pricing engine, or lib/orders, so none of
// that ships in the public bundle. The dashboard lives at /dashboard only.
export default function Page() {
  return <PublicApp />;
}
