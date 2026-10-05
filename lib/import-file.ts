import { cleanGutenberg } from "./gutenberg";

/** Turns a dropped or opened file into { title, text }. Runs in the browser:
 * PDFs through pdf.js, EPUBs by unzipping and walking the spine. */

export type Imported = { title: string; text: string };

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

export async function importFile(file: File): Promise<Imported> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return importPdf(file);
  if (name.endsWith(".epub") || file.type === "application/epub+zip") return importEpub(file);
  const raw = await file.text();
  const book = cleanGutenberg(raw);
  return { title: book.title ?? stripExt(file.name), text: book.text };
}

// ---------- PDF ----------

type PdfItem = { str: string; transform: number[]; height: number; hasEOL?: boolean };

async function importPdf(file: File): Promise<Imported> {
  const pdfjs = await import("pdfjs-dist");
  // Copied into public/ by the postinstall script so the version always matches.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const meta = await doc.getMetadata().catch(() => null);
  const paragraphs: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items = (content.items as PdfItem[]).filter((it) => "str" in it);

    // Rebuild lines from y positions, then start a new paragraph wherever
    // the gap between lines is clearly bigger than the usual line spacing.
    const lines: { y: number; h: number; text: string }[] = [];
    for (const it of items) {
      const y = it.transform[5];
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - y) < Math.max(2, it.height * 0.5)) last.text += it.str;
      else lines.push({ y, h: it.height || 10, text: it.str });
    }
    const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y)).filter((g) => g > 0);
    const typical = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 12;

    let current = "";
    lines.forEach((line, i) => {
      const text = line.text.replace(/\s+/g, " ").trim();
      if (!text) return;
      const gap = i > 0 ? Math.abs(lines[i - 1].y - line.y) : 0;
      if (current && gap > typical * 1.5) {
        paragraphs.push(current);
        current = "";
      }
      // Rejoin words hyphenated across a line break.
      current = current.endsWith("-") ? current.slice(0, -1) + text : current ? `${current} ${text}` : text;
    });
    if (current) paragraphs.push(current);
  }

  const info = meta?.info as { Title?: string } | undefined;
  const text = paragraphs.join("\n\n");
  if (!text.trim()) throw new Error("No text found in that PDF. It may be scanned images.");
  return { title: info?.Title?.trim() || stripExt(file.name), text };
}

// ---------- EPUB ----------

async function importEpub(file: File): Promise<Imported> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parse = (xml: string, type: DOMParserSupportedType = "application/xml") =>
    new DOMParser().parseFromString(xml, type);

  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container && parse(container).querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("That EPUB looks broken: no package file.");
  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new Error("That EPUB looks broken: package file missing.");
  const opf = parse(opfXml);
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = new Map<string, string>();
  opf.querySelectorAll("manifest > item").forEach((it) => {
    const id = it.getAttribute("id");
    const href = it.getAttribute("href");
    if (id && href) manifest.set(id, href);
  });

  const paragraphs: string[] = [];
  for (const ref of Array.from(opf.querySelectorAll("spine > itemref"))) {
    const href = manifest.get(ref.getAttribute("idref") ?? "");
    if (!href) continue;
    const path = decodeURIComponent(base + href.split("#")[0]);
    const xhtml = await zip.file(path)?.async("string");
    if (!xhtml) continue;
    let doc = parse(xhtml, "application/xhtml+xml");
    if (doc.querySelector("parsererror")) doc = parse(xhtml, "text/html");
    const blocks = doc.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre");
    blocks.forEach((el) => {
      if (el.querySelector("p, li, blockquote")) return;
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) paragraphs.push(t);
    });
  }

  const title = opf.getElementsByTagName("dc:title")[0]?.textContent?.trim() || stripExt(file.name);
  const text = paragraphs.join("\n\n");
  if (!text.trim()) throw new Error("No readable text found in that EPUB.");
  return { title, text };
}
