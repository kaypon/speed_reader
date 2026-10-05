/** Project Gutenberg support. Any link to a Gutenberg book (landing page,
 * read-online HTML, EPUB, or text download) is swapped for the plain-text
 * file, and the license header and footer are trimmed off. */

const BOOK_URL = /^https?:\/\/(?:www\.)?gutenberg\.org\/(?:ebooks\/(\d+)|cache\/epub\/(\d+)\/|files\/(\d+)\/)/i;

/** Gutenberg book number for a link, or null if it isn't a book link. */
export function gutenbergId(link: string): string | null {
  const m = link.trim().match(BOOK_URL);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

export const gutenbergTextUrl = (id: string) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

const START = /^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*\*{3}\s*$/im;
const END = /^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*\*{3}\s*$/im;

/** True if text looks like a Project Gutenberg plain-text file. */
export const isGutenbergText = (text: string) => START.test(text) && END.test(text);

/** Strips the license header and footer from a Gutenberg plain-text file
 * and pulls out the title and author. Leaves other text untouched. */
export function cleanGutenberg(raw: string): { title: string | null; text: string } {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const start = text.match(START);
  const end = text.match(END);
  if (!start || start.index === undefined || !end || end.index === undefined || end.index < start.index) {
    return { title: null, text: raw };
  }
  const header = text.slice(0, start.index);
  const title = header.match(/^Title:\s*(.+)$/m)?.[1].trim() ?? null;
  const author = header.match(/^Author:\s*(.+)$/m)?.[1].trim() ?? null;

  const body = text
    .slice(start.index + start[0].length, end.index)
    // Some files repeat a "Produced by …" credit right after the start marker.
    .replace(/^\s*(?:Produced by|E-text prepared by|Transcribed from)[^\n]*(?:\n[^\n]+)*\n/i, "")
    // Picture placeholders, which can span several lines.
    .replace(/\[Illustration[^\]]*\]/gi, "")
    // _italic_ markers.
    .replace(/_([^_\n]+(?:\n[^_\n]+)?)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title: title && author ? `${title} by ${author}` : title, text: body };
}
