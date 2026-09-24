import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const legacyDestinations = new Set(["caseload", "referrals", "town-hall", "planner", "capacity", "income", "supervision"]);
  const [, root, section] = request.nextUrl.pathname.split("/");
  if (root === "dashboard" && legacyDestinations.has(section)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/requests";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return await updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/refer/:path*"],
};
