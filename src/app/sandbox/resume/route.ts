import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_SITE } from "@/lib/env";

const PASS_COOKIE = "pa_pass";

// Quietly signs this device back in to its sandbox when the session has
// gone (for example a dropped refresh), using the personal link the device
// already opened, then returns to the page the person was on. The sandbox's
// data is kept; only its one-off password is renewed.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const rawNext = request.nextUrl.searchParams.get("next") || "/dashboard";
  const next = /^\/dashboard(\/|$|\?)/.test(rawNext) ? rawNext : "/dashboard";
  const jar = await cookies();
  const token = jar.get(PASS_COOKIE)?.value || "";
  if (jar.get("pa_resumed")?.value) return NextResponse.redirect(`${origin}/sandbox/ended`);
  if (!IS_DEMO_SITE || !/^[a-f0-9]{16,64}$/i.test(token)) return NextResponse.redirect(`${origin}/sandbox/ended`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_sandbox", { p_token: token }).maybeSingle<any>();
  // A connection hiccup keeps the link on this device so Continue can be
  // tried again; only a link the database says is over is forgotten.
  if (error && error.code !== "P0001") return NextResponse.redirect(`${origin}/sandbox/ended`);
  if (error || !data) {
    const res = NextResponse.redirect(`${origin}/sandbox/ended?expired=1`);
    res.cookies.delete(PASS_COOKIE);
    return res;
  }
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
  if (signInError) return NextResponse.redirect(`${origin}/sandbox/ended`);
  // Marks a fresh resume for a few seconds, so a session that still
  // doesn't stick lands on the explanation rather than looping.
  const res = NextResponse.redirect(`${origin}${next}`);
  res.cookies.set("pa_resumed", "1", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 20 });
  return res;
}
