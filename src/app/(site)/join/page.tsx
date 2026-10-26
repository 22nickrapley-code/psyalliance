import { redirect } from "next/navigation";
import { JOIN_URL, IS_DEMO_SITE } from "@/lib/env";

// The old "Request an invitation" form. Anyone can now create an account,
// so this address goes straight to sign-up, keeping where they came from.
export default async function JoinPage(props: { searchParams: Promise<{ from?: string }> }) {
  const sp = await props.searchParams;
  const from = String(sp.from || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
  const base = IS_DEMO_SITE ? JOIN_URL : "/auth/sign-up";
  redirect(from ? `${base}?from=${from}` : base);
}
