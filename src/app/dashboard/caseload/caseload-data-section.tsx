"use client";

import { useMemo, useState, useTransition } from "react";
import PieChart from "@/components/pie-chart";
import { useCaseloadHighlight, type NeedArea } from "./caseload-context";
import { getCaseloadQuickMatch } from "./actions";
import Link from "next/link";

const PALETTE = [
  "#2456a6", "#7a3fa0", "#b3591a", "#1c7a5e", "#a6334a",
  "#5b6b8c", "#c98a1e", "#3d7a9e", "#8c4f9e", "#6b8c3d",
];

const AREA_LABEL: Record<NeedArea, string> = {
  all: "All",
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
};

type QuickMatchCandidate = {
  profileId: string;
  fullName: string;
  connectionTier: string;
  gridScore: number;
  city: string | null;
  state: string | null;
};

export default function CaseloadDataSection({ cases }: { cases: any[] }) {
  const { highlight, setHighlight, clearHighlight } = useCaseloadHighlight();
  const [area, setArea] = useState<NeedArea>("all");
  const [candidates, setCandidates] = useState<QuickMatchCandidate[] | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const values =
        area === "all"
          ? [c.primary_need, c.secondary_need, c.tertiary_need]
          : area === "primary"
          ? [c.primary_need]
          : area === "secondary"
          ? [c.secondary_need]
          : [c.tertiary_need];
      for (const v of values) {
        if (!v) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([label, value], i) => ({ key: label, label, value, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value);
  }, [cases, area]);

  const selectedValue = highlight.value;
  const selectedSlice = distribution.find((d) => d.key === selectedValue) || null;

  const stateBreakdown = useMemo(() => {
    if (!selectedValue) return [];
    const counts = new Map<string, number>();
    for (const c of cases) {
      const matches =
        area === "all"
          ? c.primary_need === selectedValue || c.secondary_need === selectedValue || c.tertiary_need === selectedValue
          : area === "primary"
          ? c.primary_need === selectedValue
          : area === "secondary"
          ? c.secondary_need === selectedValue
          : c.tertiary_need === selectedValue;
      if (!matches) continue;
      const state = c.state || "Unspecified";
      counts.set(state, (counts.get(state) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [cases, area, selectedValue]);

  function handleSelectSlice(key: string) {
    if (highlight.value === key && highlight.area === area) {
      clearHighlight();
      setCandidates(null);
      return;
    }
    setHighlight({ area, value: key });
    setCandidates(null);
    setMatchError(null);
  }

  function handleAreaChange(next: NeedArea) {
    setArea(next);
    clearHighlight();
    setCandidates(null);
  }

  function handleRefreshMatches() {
    if (!selectedValue) return;
    setMatchError(null);
    startTransition(async () => {
      const result = await getCaseloadQuickMatch(selectedValue);
      if (result.error) {
        setMatchError(result.error);
        return;
      }
      setCandidates(result.candidates || []);
    });
  }

  return (
    <div className="card">
      <h2>Caseload (Data)</h2>
      <p className="muted">
        A breakdown of what your active caseload treats, by treatment area. Click a slice to see
        the state-by-state split and find colleagues who treat it too.
      </p>

      <div className="field-row" style={{ alignItems: "center", marginBottom: "0.75rem" }}>
        <span className="muted" style={{ fontSize: "0.85rem" }}>Selected data:</span>
        {(["all", "primary", "secondary", "tertiary"] as NeedArea[]).map((a) => (
          <button
            key={a}
            type="button"
            className={area === a ? "" : "secondary"}
            style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
            onClick={() => handleAreaChange(a)}
          >
            {AREA_LABEL[a]}
          </button>
        ))}
      </div>

      {distribution.length === 0 ? (
        <p className="muted">Add treatment needs to your active clients to see this breakdown.</p>
      ) : (
        <PieChart
          slices={distribution}
          selectedKey={highlight.area === area ? highlight.value : null}
          onSelect={handleSelectSlice}
        />
      )}

      {selectedSlice && (
        <div className="caseload-data-detail">
          <h3>{selectedSlice.label} — by state</h3>
          <table style={{ maxWidth: 420 }}>
            <thead>
              <tr>
                <th>State</th>
                <th>Clients</th>
              </tr>
            </thead>
            <tbody>
              {stateBreakdown.map(([state, count]) => (
                <tr key={state}>
                  <td>{state}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="widget-header" style={{ marginTop: "1.25rem" }}>
            <h3 style={{ margin: 0 }}>Quick Match — colleagues who treat {selectedSlice.label}</h3>
            <button type="button" className="secondary" onClick={handleRefreshMatches} disabled={isPending}>
              {isPending ? "Matching…" : "Refresh"}
            </button>
          </div>
          {matchError && <p className="error-banner">{matchError}</p>}
          {candidates && candidates.length === 0 && !matchError && (
            <p className="muted">No connected or directory colleagues treat this area yet.</p>
          )}
          {candidates && candidates.length > 0 && (
            <ul className="quick-match-list">
              {candidates.map((c, i) => (
                <li key={c.profileId}>
                  <span className="quick-match-rank">#{i + 1}</span>
                  <Link href={`/dashboard/people/${c.profileId}`}>{c.fullName}</Link>
                  <span className={`tag tier-${c.connectionTier}`}>
                    {c.connectionTier === "none" ? "Directory" : c.connectionTier[0].toUpperCase() + c.connectionTier.slice(1)}
                  </span>
                  {c.city || c.state ? (
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {[c.city, c.state].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {!candidates && !matchError && (
            <p className="muted">Click Refresh to see your top ranked colleagues for this specialism.</p>
          )}
        </div>
      )}
    </div>
  );
}
