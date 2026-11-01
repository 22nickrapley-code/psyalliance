import { redirect } from "next/navigation";
import { REAL_SITE_URL, IS_DEMO_SITE } from "@/lib/env";

// There is no public Library page any more (Nick, 1 Nov): the homepage shows every template's title
// and a one-line description, and members open the full Library inside PsyAlliance once verified.
export default function PublicLibraryPage() {
  redirect(IS_DEMO_SITE && process.env.NODE_ENV === "production" ? `${REAL_SITE_URL}/#library` : "/#library");
}
