import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request to a protected route
 * and redirects unauthenticated visitors to sign-in. Called from middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options ?? {})
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    // A sandbox device whose session dropped: sign it back in with the
    // personal link it already opened, and come back to this page.
    if (process.env.NEXT_PUBLIC_APP_ENV === "demo" && request.cookies.get("pa_pass")?.value && !request.cookies.get("pa_resumed")?.value && request.method === "GET") {
      url.pathname = "/sandbox/resume";
      url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    // On the demo site a signed-out visitor is almost always a sandbox
    // guest, who has no password: explain, rather than show sign-in.
    url.pathname = process.env.NEXT_PUBLIC_APP_ENV === "demo" ? "/sandbox/ended" : "/auth/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // The GP/physician referral portal's sign-in/sign-up pages live under
  // /auth (not /refer) specifically so they're never wrapped by the /refer
  // layout's own "no session -> redirect to sign-in" guard - nesting them
  // under /refer would self-redirect-loop on that exact page. Every other
  // /refer/* route does need a session.
  if (!user && request.nextUrl.pathname.startsWith("/refer")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/refer-sign-in";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
