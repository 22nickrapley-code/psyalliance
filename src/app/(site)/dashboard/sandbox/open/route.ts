import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sandboxDestination } from "../open-sandbox";

// A plain link to your sandbox (the banner's "Your sandbox"): straight to
// the sandbox's welcome page, the same as "Open your sandbox" on Home.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const to = await sandboxDestination(supabase, user);
  return NextResponse.redirect(new URL(to, request.url), 303);
}
