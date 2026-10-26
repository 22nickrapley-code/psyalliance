import { redirect } from "next/navigation";

// "When you're full" is retired (Nick, 10 Oct): it confused more than it
// helped. Old links land on Profile. The view and database tables are kept
// in case it returns.
export default function FullPage() {
  redirect("/dashboard/profile");
}
