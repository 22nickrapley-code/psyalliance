// What a member sees when the database turns a save down (release testing
// ERR-01). Our own rules raise plain sentences meant for members (code
// P0001), and those are shown as they are; anything else is the database's
// own wording, which members should never see. The original goes to the
// server log for us.
type DbError = { message?: string; code?: string; details?: string | null; hint?: string | null } | null | undefined;

export function friendly(error: DbError, fallback = "That didn't save. Please try again in a moment."): string {
  if (!error) return fallback;
  if (error.code === "P0001" && error.message) return error.message;
  console.error("save refused:", error.code || "", error.message || "", error.details || "");
  if (error.code === "23505") return "That's already saved.";
  if (error.code === "23514" || error.code === "22P02" || error.code === "23502") return "Some of the details weren't accepted. Check the form and try again.";
  if (error.code === "42501" || error.code === "PGRST301" || /row-level security|permission denied/i.test(error.message || "")) return "You don't have access to do that.";
  return fallback;
}
