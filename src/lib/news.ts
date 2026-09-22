import { createClient } from "@/lib/supabase/server";

// Small starter list of reputable, freely-syndicated psychology/science
// sources. Deliberately not scraping arbitrary sites: RSS is the sanctioned,
// stable way these outlets already offer their headlines for reuse, and
// only the title/link/date are stored, never the article body - the ticker
// links out to the source rather than reproducing it.
const NEWS_SOURCES: { name: string; url: string }[] = [
  { name: "ScienceDaily: Psychology", url: "https://rss.sciencedaily.com/mind_brain/psychology.xml" },
  { name: "ScienceDaily: Mind & Brain", url: "https://rss.sciencedaily.com/mind_brain.xml" },
];

// Refreshed at most twice a day - per Nick's own call that this field
// doesn't move fast enough to need more, and there's no background cron in
// this app, so a stale cache is topped up inline whenever the Overview page
// happens to load and finds it old enough.
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const ITEMS_PER_SOURCE = 8;

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function cleanText(raw: string): string {
  return raw
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

function parseRssItems(xml: string): { title: string; link: string; publishedAt: string | null }[] {
  const items: { title: string; link: string; publishedAt: string | null }[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) && items.length < ITEMS_PER_SOURCE) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    if (!title || !link) continue;
    const parsedDate = pubDate ? new Date(pubDate) : null;
    items.push({
      title: cleanText(title),
      link: cleanText(link),
      publishedAt: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
    });
  }
  return items;
}

// Best-effort, TTL-gated refresh. Never throws - a feed timing out or a
// source changing its markup should never take the Overview page down with
// it, just leave the cache a bit staler than usual until the next visit.
export async function refreshNewsCacheIfStale(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data: latest } = await supabase
      .from("news_cache")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isStale = !latest || Date.now() - new Date(latest.fetched_at).getTime() > REFRESH_INTERVAL_MS;
    if (!isStale) return;

    for (const source of NEWS_SOURCES) {
      try {
        const res = await fetch(source.url, {
          headers: { "User-Agent": "PsyAlliance/1.0 (+https://psyalliance.22nickrapley.workers.dev)" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const items = parseRssItems(xml);
        if (items.length === 0) continue;

        await supabase.from("news_cache").upsert(
          items.map((it) => ({
            source_name: source.name,
            title: it.title,
            link: it.link,
            published_at: it.publishedAt,
            fetched_at: new Date().toISOString(),
          })),
          { onConflict: "link" }
        );
      } catch {
        // One source failing (timeout, markup change) shouldn't block the others.
      }
    }
  } catch {
    // Cache read itself failed - just skip the refresh this visit.
  }
}

export type NewsItem = {
  sourceName: string;
  title: string;
  link: string;
  publishedAt: string | null;
};

export async function getRecentNews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  limit = 8
): Promise<NewsItem[]> {
  const { data } = await supabase
    .from("news_cache")
    .select("source_name, title, link, published_at")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  return (data || []).map((n) => ({
    sourceName: n.source_name,
    title: n.title,
    link: n.link,
    publishedAt: n.published_at,
  }));
}
