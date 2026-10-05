import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { FetchError, safeFetchText } from "@/lib/safe-fetch";

/** Turns block-level HTML into plain text with blank lines between
 * paragraphs, so the reader can pause on paragraph breaks. */
function htmlToParagraphs(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks = document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption");
  const parts = blocks.length
    ? Array.from(blocks)
        // Skip containers whose text is already counted through a child block.
        .filter((el) => !el.querySelector("p, li, blockquote"))
        .map((el) => el.textContent ?? "")
    : [document.body.textContent ?? ""];
  return parts
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  let link: unknown;
  try {
    ({ url: link } = await request.json());
  } catch {
    return Response.json({ error: "Send a link to import." }, { status: 400 });
  }
  if (typeof link !== "string" || !link.trim()) {
    return Response.json({ error: "Send a link to import." }, { status: 400 });
  }

  try {
    const page = await safeFetchText(link);

    if (page.contentType.includes("text/plain")) {
      return Response.json({ title: new URL(page.url).pathname.split("/").pop() || page.url, text: page.body, url: page.url });
    }

    const { document } = parseHTML(page.body);
    const article = new Readability(document as unknown as Document).parse();
    const text = article?.content ? htmlToParagraphs(article.content) : "";
    if (!text) {
      return Response.json(
        { error: "Couldn't find an article on that page. It may need a login or load its text with JavaScript." },
        { status: 422 }
      );
    }
    return Response.json({ title: article?.title?.trim() || new URL(page.url).hostname, text, url: page.url });
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: e.message }, { status: e.status });
    console.error("extract failed", e);
    return Response.json({ error: "Something went wrong reading that page." }, { status: 500 });
  }
}
