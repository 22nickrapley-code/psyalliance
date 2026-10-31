import "../premium.css";
import "./start.css";
import { redirect } from "next/navigation";
import { IS_DEMO_SITE, REAL_SITE_URL } from "@/lib/env";
import { PublicNav, PublicFooter } from "../_public/chrome";
import { Guide } from "./guide";

export const metadata = { title: "Show me how PsyAlliance could help", description: "Choose what would be useful and see a short, fictional walkthrough. No email address needed." };

export default function StartPage() {
  if (IS_DEMO_SITE) redirect(`${REAL_SITE_URL}/start`);
  return (
    <div className="pa">
      <PublicNav />
      <main>
        <section className="public-section guide-wrap">
          <div className="section-inner guide-inner">
            <Guide />
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
