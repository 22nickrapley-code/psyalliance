import { redirect } from "next/navigation";
import { REAL_SITE_URL, IS_DEMO_SITE } from "@/lib/env";

// Old links to a single public template land on the homepage Library section (Nick, 1 Nov).
export default function PublicTemplatePage() {
  redirect(IS_DEMO_SITE && process.env.NODE_ENV === "production" ? `${REAL_SITE_URL}/#library` : "/#library");
}
