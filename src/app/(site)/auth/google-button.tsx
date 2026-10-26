"use client";

import { createClient } from "@/lib/supabase/client";

// Considerations.txt: "Can we log in using Google account - no need for
// sign up.. | Yes - we can do this". Supabase handles the OAuth exchange
// once the Google provider is turned on in the Supabase dashboard (Auth ->
// Providers -> Google, with a Google Cloud OAuth client ID/secret that only
// Nick can create under his own Google account) - this button is wired and
// ready, it just won't do anything until that provider is enabled.
export function GoogleSignInButton() {
  async function handleClick() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button type="button" onClick={handleClick} className="secondary" style={{ width: "100%" }}>
      <svg width="16" height="16" viewBox="0 0 48 48" style={{ verticalAlign: "-3px", marginRight: "0.5rem" }} aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l6-6C34.9 5.1 29.8 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.2 18.9 12 24 12c3.1 0 5.9 1.1 8 3.1l6-6C34.9 5.1 29.8 3 24 3c-7.7 0-14.3 4.3-17.7 10.7z" />
        <path fill="#4CAF50" d="M24 45c5.7 0 10.8-1.9 14.7-5.2l-6.8-5.7C29.8 35.9 27 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 40.6 16.2 45 24 45z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.8 5.7C41.6 36 44 30.5 44 24c0-1.4-.1-2.7-.4-3.5z" />
      </svg>
      Continue with Google
    </button>
  );
}
