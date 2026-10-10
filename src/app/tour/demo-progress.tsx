"use client";

import { useEffect, useState } from "react";

// Which demos this visitor has watched, kept in their own browser only.
const KEY = "pa-demos-watched";
function read(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function MarkDone({ demo }: { demo: string }) {
  useEffect(() => {
    try {
      const seen = new Set(read());
      seen.add(demo);
      window.localStorage.setItem(KEY, JSON.stringify([...seen]));
    } catch {
      /* storage unavailable: nothing to remember */
    }
  }, [demo]);
  return null;
}

type DemoCard = { key: string; title: string; blurb: string; minutes: string; screens: number };

export function DemoGrid({ demos, current }: { demos: DemoCard[]; current?: string }) {
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    const s = read();
    setSeen(current && !s.includes(current) ? [...s, current] : s);
  }, [current]);
  // On a completion page, unwatched demos come first.
  const list = current ? [...demos.filter((d) => !seen.includes(d.key)), ...demos.filter((d) => seen.includes(d.key))] : demos;
  return (
    <div className="demo-grid">
      {list.map((d) => {
        const n = demos.findIndex((x) => x.key === d.key) + 1;
        const watched = seen.includes(d.key);
        return (
          <a key={d.key} href={`/tour/${d.key}`} className={`demo-card${watched ? " watched" : ""}`}>
            <span className="demo-n">{n}</span>
            <span className="demo-meta">
              {d.minutes} &middot; then try {d.screens} screens
              {watched && <span className="demo-watched">Watched</span>}
            </span>
            <b>{d.title}</b>
            <span className="demo-blurb">{d.blurb}</span>
            <span className="text-arrow">{watched ? "Watch again" : "Watch, then try it"} &rarr;</span>
          </a>
        );
      })}
    </div>
  );
}
