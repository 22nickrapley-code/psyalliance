import type { ReactNode } from "react";
import type { ActivityTickerItem } from "@/lib/activity";
import type { NewsItem } from "@/lib/news";

// A single scrolling bar mixing "things relevant to you" (new members who
// share your specialism/state, new Town Hall conversations, new Shared
// Library documents - all pre-filtered server-side by getActivityTicker)
// with a small feed of external psychology news. Pure CSS marquee, no JS:
// the track is the item list rendered twice back to back, animated from
// 0 to -50% so it loops with no visible seam, and paused on hover so a
// message is actually readable if someone wants to stop and read it.
type TickerEntry = {
  key: string;
  createdAt: string;
  content: ReactNode;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ActivityTicker({ activity, news }: { activity: ActivityTickerItem[]; news: NewsItem[] }) {
  const activityEntries: TickerEntry[] = activity.map((a) => ({
    key: `a-${a.id}`,
    createdAt: a.createdAt,
    content: (
      <span className="activity-ticker-item">
        <span className="tag">{a.eventType === "new_member" ? "New member" : a.eventType === "town_hall_post" ? "Town Hall" : "Document"}</span>
        <strong>{a.actorName}</strong> {a.summary}
        <span className="muted">· {timeAgo(a.createdAt)}</span>
      </span>
    ),
  }));

  const newsEntries: TickerEntry[] = news.map((n, i) => ({
    key: `n-${i}-${n.link}`,
    createdAt: n.publishedAt || new Date(0).toISOString(),
    content: (
      <span className="activity-ticker-item">
        <span className="tag tag-news">News</span>
        <a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a>
        <span className="muted">· {n.sourceName}</span>
      </span>
    ),
  }));

  const entries = [...activityEntries, ...newsEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (entries.length === 0) {
    return (
      <div className="activity-ticker">
        <p className="activity-ticker-empty muted">
          Nothing new to report yet, check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="activity-ticker">
      <div className="activity-ticker-track">
        {entries.map((e) => (
          <span key={`${e.key}-1`} className="activity-ticker-entry">{e.content}</span>
        ))}
        {entries.map((e) => (
          <span key={`${e.key}-2`} className="activity-ticker-entry" aria-hidden="true">{e.content}</span>
        ))}
      </div>
    </div>
  );
}
