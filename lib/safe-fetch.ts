import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export class FetchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Only plain public unicast addresses pass. Loopback, private, link-local,
 * CGNAT, multicast, reserved, and IPv6 forms that tunnel or translate to
 * IPv4 (NAT64, 6to4, Teredo) are all refused; IPv4-mapped IPv6 is judged by
 * the IPv4 address inside it. */
function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  return addr.range() === "unicast";
}

const PRIVATE_ERROR = "That address points at a private network.";

/** DNS lookup used for the actual socket connection. Checking here, at
 * connect time, closes the DNS-rebinding gap: there is no second lookup
 * that could answer differently from the one that was checked. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 0);
    const safe = addresses.filter((a) => isPublicAddress(a.address));
    if (safe.length === 0 || safe.length !== addresses.length) {
      return callback(Object.assign(new Error(PRIVATE_ERROR), { code: "EPRIVATE" }), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
};

const agent = new Agent({ connect: { lookup: publicOnlyLookup } });

function assertAllowedUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only http and https links work.");
  }
  if (url.username || url.password) throw new FetchError("Links with credentials aren't allowed.");
  // IP literals never go through DNS, so the connect-time lookup can't see
  // them: check them here instead.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new FetchError(PRIVATE_ERROR);
}

const isPrivateRefusal = (e: unknown): boolean => {
  for (let cur = e; cur instanceof Error; cur = (cur as Error & { cause?: unknown }).cause) {
    if ((cur as Error & { code?: string }).code === "EPRIVATE") return true;
  }
  return false;
};

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
    assertAllowedUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      dispatcher: agent,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; SpeedReader/1.0)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    }).catch((e: unknown) => {
      if (isPrivateRefusal(e)) throw new FetchError(PRIVATE_ERROR);
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
