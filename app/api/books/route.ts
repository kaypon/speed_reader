import { FetchError, safeFetchText } from "@/lib/safe-fetch";

export type BookResult = {
  id: string;
  title: string;
  author: string;
  cover: string;
};

const PAGE_SIZE = 25;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

/** Searches Project Gutenberg's own catalog (its OPDS feed, sorted by
 * popularity) and returns the books, skipping the "Authors"/"Subjects"
 * shortcut entries the feed puts first. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const page = Math.max(1, Math.min(40, Number(params.get("page")) || 1));
  if (!q) return Response.json({ results: [], hasMore: false });

  const feed = new URL("https://www.gutenberg.org/ebooks/search.opds/");
  feed.searchParams.set("query", q);
  feed.searchParams.set("sort_order", "downloads");
  if (page > 1) feed.searchParams.set("start_index", String((page - 1) * PAGE_SIZE + 1));

  try {
    const { body } = await safeFetchText(feed.toString(), /atom\+xml|application\/xml|text\/xml/);
    const results: BookResult[] = [];
    for (const entry of body.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
      const id = entry.match(/<id>https?:\/\/www\.gutenberg\.org\/ebooks\/(\d+)\.opds<\/id>/)?.[1];
      if (!id) continue;
      results.push({
        id,
        title: decode(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? `Book ${id}`),
        author: decode(entry.match(/<content type="text">([\s\S]*?)<\/content>/)?.[1] ?? "").replace(/^\d+ downloads$/, ""),
        cover: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.small.jpg`,
      });
    }
    const hasMore = /<link[^>]+rel="next"/.test(body);
    return Response.json(
      { results, hasMore },
      // Searches repeat a lot ("pride and prejudice"); let the CDN answer
      // them for an hour instead of asking Gutenberg every time.
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (e) {
    if (e instanceof FetchError) {
      return Response.json({ error: "Project Gutenberg isn't answering right now. Try again in a bit." }, { status: 502 });
    }
    console.error("book search failed", e);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
