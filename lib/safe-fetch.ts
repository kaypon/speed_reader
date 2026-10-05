import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export class FetchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** True for loopback, private, link-local, CGNAT, multicast and other
 * non-public ranges, so a pasted link can't be used to probe the server's
 * own network. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") ||
    v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only http and https links work.");
  }
  if (url.username || url.password) throw new FetchError("Links with credentials aren't allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new FetchError("Couldn't find that site.");
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new FetchError("That address points at a private network.");
  }
}

/** Fetches a public web page as text, re-checking every redirect hop, with a
 * timeout and a size cap. */
export async function safeFetchText(input: string): Promise<{ url: string; body: string; contentType: string }> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new FetchError("That doesn't look like a link.");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; SpeedReader/1.0)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    }).catch((e: unknown) => {
      throw new FetchError(
        e instanceof Error && e.name === "TimeoutError" ? "That site took too long to answer." : "Couldn't reach that site.",
        502
      );
    });

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new FetchError("That site redirected nowhere.", 502);
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new FetchError(`That site answered with an error (${res.status}).`, 502);

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/.test(contentType)) {
      throw new FetchError("That link isn't a web page. For PDFs and EPUBs, download the file and open it instead.");
    }

    const reader = res.body?.getReader();
    if (!reader) throw new FetchError("That page was empty.", 502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new FetchError("That page is too big to import.", 413);
      }
      chunks.push(value);
    }
    const body = new TextDecoder().decode(Buffer.concat(chunks));
    return { url: url.toString(), body, contentType };
  }
  throw new FetchError("Too many redirects.", 502);
}
