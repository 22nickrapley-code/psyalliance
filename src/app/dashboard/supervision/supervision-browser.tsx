"use client";

import { useMemo, useState } from "react";
import Avatar from "../avatar";

export type SupervisionPerson = {
  id: string;
  fullName: string;
  credentialPrefix: string | null;
  qualificationLevel: string;
  city: string | null;
  state: string | null;
  specialisms: string[];
  avatarUrl: string | null;
};

const PAGE_SIZE = 10;

type Mode = "provide" | "receive";

// One consolidated Supervision list instead of two separate always-visible
// tables - a Provide/Receive toggle (top-right, same instant no-reload
// pattern as ToggleBox elsewhere) swaps which group is shown, and whichever
// group is active paginates client-side at 10 per page rather than one long
// table. Both full lists are handed in as plain data; nothing here refetches.
export default function SupervisionBrowser({
  supervisors,
  supervisees,
  startConversation,
}: {
  supervisors: SupervisionPerson[];
  supervisees: SupervisionPerson[];
  startConversation: (formData: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("provide");
  const [page, setPage] = useState(0);

  const people = mode === "provide" ? supervisors : supervisees;
  const pageCount = Math.max(1, Math.ceil(people.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => people.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [people, currentPage]
  );

  function switchMode(next: Mode) {
    setMode(next);
    setPage(0);
  }

  return (
    <div>
      <div className="widget-header">
        <h2 style={{ margin: 0 }}>
          {mode === "provide"
            ? `Open to provide supervision (${supervisors.length})`
            : `Looking to receive supervision (${supervisees.length})`}
        </h2>
        <span style={{ display: "inline-flex", gap: "0.4rem", flex: "0 0 auto" }}>
          <button
            type="button"
            className={mode === "provide" ? "" : "secondary"}
            style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
            onClick={() => switchMode("provide")}
          >
            Provide
          </button>
          <button
            type="button"
            className={mode === "receive" ? "" : "secondary"}
            style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
            onClick={() => switchMode("receive")}
          >
            Receive
          </button>
        </span>
      </div>

      {mode === "receive" && (
        <p className="muted">
          If you're an experienced clinician, these are colleagues who've marked themselves as
          seeking supervision, reach out if you have capacity.
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Location</th>
            <th>Specialisms</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((p) => (
            <tr key={p.id}>
              <td>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                  <Avatar url={p.avatarUrl} name={p.fullName} size={24} />
                  <span style={{ minWidth: 0 }}>
                    <a href={`/dashboard/people/${p.id}`} className="person-link">
                      {p.credentialPrefix} {p.fullName}
                    </a>
                    {", " + p.qualificationLevel}
                  </span>
                </span>
              </td>
              <td>{p.city || "-"}{p.state ? `, ${p.state}` : ""}</td>
              <td>{p.specialisms.slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}</td>
              <td>
                {mode === "provide" ? (
                  <form action={startConversation}>
                    <input type="hidden" name="participant_ids" value={p.id} />
                    <input type="hidden" name="title" value="Supervision request" />
                    <input
                      type="hidden"
                      name="body"
                      value={`Hi ${p.fullName}, I saw you're open to providing supervision, would you be able to take on a supervisee? Happy to share more about my background if useful.`}
                    />
                    <button type="submit" className="secondary">Request supervision</button>
                  </form>
                ) : (
                  <form action={startConversation}>
                    <input type="hidden" name="participant_ids" value={p.id} />
                    <input type="hidden" name="title" value="Supervision offer" />
                    <input
                      type="hidden"
                      name="body"
                      value={`Hi ${p.fullName}, I saw you're looking for supervision, I have some capacity if you'd like to talk it through.`}
                    />
                    <button type="submit" className="secondary">Offer supervision</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">No colleagues match, try widening your filters.</td>
            </tr>
          )}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.9rem" }}>
          <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className="muted" style={{ alignSelf: "center", fontSize: "0.85rem" }}>
            Page {currentPage + 1} of {pageCount}
          </span>
          <button type="button" className="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
