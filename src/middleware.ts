import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// www.psyalliance.org goes to psyalliance.org, so there is one address (and
// one sign-in). Signed-in areas also refresh the session.
export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();
  if (host.startsWith("www.")) {
    const { pathname, search } = request.nextUrl;
    return NextResponse.redirect(`https://${host.slice(4)}${pathname}${search}`, 308);
  }
  const path = request.nextUrl.pathname;
  if (path.startsWith("/dashboard") || path.startsWith("/refer")) return await updateSession(request);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|css|js|woff2?|pdf)$).*)"],
};
