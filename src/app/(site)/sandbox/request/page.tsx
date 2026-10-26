import { redirect } from "next/navigation";
import { JOIN_URL } from "@/lib/env";

// Sandboxes now come with every PsyAlliance account, so asking for one
// separately goes to the one way in.
export default function SandboxRequestPage() {
  redirect(JOIN_URL);
}
