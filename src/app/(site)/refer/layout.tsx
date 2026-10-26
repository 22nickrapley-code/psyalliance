import { redirect } from "next/navigation";

// Paused before launch: the physician referral portal collected patient
// initials and contact details, which PsyAlliance doesn't hold. Every
// /refer page goes to the closed notice until it's redesigned.
export default async function ReferLayout(_: { children: React.ReactNode }) {
  redirect("/auth/refer-sign-in");
}
