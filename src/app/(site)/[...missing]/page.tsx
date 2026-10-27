import { notFound } from "next/navigation";

// With the workspace and the account pages in their own layout groups there is
// no single root layout left to answer an address nothing matches, and Next.js
// would send its bare "404". This catches such an address inside the public
// site's layout so it gets the site's own "Page not found" page (status 404).
export default function Missing() {
  notFound();
}
