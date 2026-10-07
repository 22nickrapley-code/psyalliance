"use client";

import { useState } from "react";
import type { Suggestion } from "@/lib/colleague-suggestions";
import { ColleaguePicker } from "../_components/colleague-picker";
import { NavIcon } from "../icons";

type Group = { id: number; name: string; members: number };

const initials = (name: string) =>
  name
    .replace(/^(dr\.?)\s+/i, "")
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const firstNames = (people: Suggestion[], max = 2) => {
  const names = people.map((p) => p.name.replace(/,.*$/, ""));
  if (names.length <= max) return names.join(" and ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
};

// Who sees a question, chosen in one place: each option says who that is
// and why you'd pick it, and the summary underneath names the people. The
// colleague list only appears when you're choosing people yourself.
export function AudiencePicker({
  suggestions,
  groups,
  preselect,
  preselectGroup,
}: {
  suggestions: Suggestion[];
  groups: Group[];
  preselect?: string;
  preselectGroup?: number;
}) {
  const trusted = suggestions.filter((s) => s.trusted);
  const [audience, setAudience] = useState<string>(preselect ? "one" : preselectGroup ? `group:${preselectGroup}` : trusted.length ? "trusted" : "selected");
  const options: { value: string; icon: string; title: string; who: string; why: string; disabled?: boolean }[] = [
    {
      value: "trusted",
      icon: "network",
      title: "Your trusted circle",
      who: trusted.length ? `${trusted.length} colleague${trusted.length === 1 ? "" : "s"}` : "No one yet",
      why: "People you know and trust. Usually the right place to start.",
      disabled: trusted.length === 0,
    },
    { value: "one", icon: "messages", title: "One colleague", who: "Private", why: "Like knocking on a colleague's door." },
    { value: "selected", icon: "members", title: "A few colleagues", who: "You choose", why: "Pick the people whose view you want." },
    ...groups.map((g) => ({
      value: `group:${g.id}`,
      icon: "consult",
      title: g.name,
      who: `${g.members} member${g.members === 1 ? "" : "s"}`,
      why: "Your consultation group. Members only.",
    })),
    { value: "wider_network", icon: "credentials", title: "The verified network", who: "Every verified member", why: "Widest reach. Shown first to members following your tags." },
  ];
  const chosen = options.find((o) => o.value === audience) || options[0];
  const group = groups.find((g) => `group:${g.id}` === audience);

  return (
    <fieldset className="audience-picker">
      <legend>
        <span className="eyebrow">Who sees this</span>
      </legend>
      <input type="hidden" name="audience" value={audience} />
      <div className="aud-options" role="radiogroup" aria-label="Who sees this">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={audience === o.value}
            disabled={o.disabled}
            className={`aud-option${audience === o.value ? " on" : ""}`}
            onClick={() => setAudience(o.value)}
          >
            <span className="aud-icon"><NavIcon name={o.icon} size={18} /></span>
            <span className="aud-copy">
              <b>{o.title}</b>
              <small className="aud-who">{o.who}</small>
              <small>{o.why}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="aud-summary" aria-live="polite">
        {audience === "trusted" && (
          <>
            <div className="aud-faces" aria-hidden="true">
              {trusted.slice(0, 6).map((p) => (
                <span key={p.id} className="aud-face">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt="" />
                  ) : (
                    initials(p.name)
                  )}
                </span>
              ))}
            </div>
            <p>
              <b>{trusted.length} trusted colleague{trusted.length === 1 ? "" : "s"}</b> will see this: {firstNames(trusted)}.
            </p>
          </>
        )}
        {group && (
          <p>
            <b>The {group.members} member{group.members === 1 ? "" : "s"} of {group.name}</b> will see this, and no one else.
          </p>
        )}
        {audience === "wider_network" && (
          <p>
            <b>Every verified member</b> can read and reply. Colleagues who follow your tags see it first, so add a tag below.
          </p>
        )}
        {(audience === "one" || audience === "selected") && (
          <ColleaguePicker
            key={audience}
            suggestions={suggestions}
            name="recipients"
            mode={audience === "one" ? "single" : "multi"}
            initial={preselect ? [preselect] : []}
            label={audience === "one" ? "Ask" : "Ask these colleagues"}
            limitPerGroup={3}
          />
        )}
      </div>
      <p className="micro-note aud-note">{chosen.title}: you review the question before anything is shared.</p>
    </fieldset>
  );
}
