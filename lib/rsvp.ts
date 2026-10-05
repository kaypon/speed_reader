import type { Settings } from "./settings";
import { familiarity } from "./frequency";

export type Word = {
  text: string;
  /** Last word of a paragraph: gets the paragraph pause. */
  paraEnd: boolean;
};

export type Chunk = {
  /** Index of the first word in the chunk, for seeking and progress. */
  start: number;
  words: Word[];
  text: string;
};

export function tokenize(raw: string): Word[] {
  const words: Word[] = [];
  for (const para of raw.split(/\n\s*\n/)) {
    const parts = para.split(/\s+/).filter(Boolean);
    parts.forEach((text, i) => words.push({ text, paraEnd: i === parts.length - 1 }));
  }
  return words;
}

const SENTENCE_END = /[.!?]["'”’)\]]*$/;
const CLAUSE_END = /[,;:—–]["'”’)\]]*$/;

/** Groups words into flashes of up to `size`, never crossing a sentence or
 * paragraph boundary so a flash always reads as one thought. */
export function chunkWords(words: Word[], size: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  let start = 0;
  words.forEach((w, i) => {
    if (cur.length === 0) start = i;
    cur.push(w);
    if (cur.length >= size || w.paraEnd || SENTENCE_END.test(w.text)) {
      chunks.push({ start, words: cur, text: cur.map((x) => x.text).join(" ") });
      cur = [];
    }
  });
  if (cur.length) chunks.push({ start, words: cur, text: cur.map((x) => x.text).join(" ") });
  return chunks;
}

const isLetter = (c: string) => /[\p{L}\p{N}]/u.test(c);

/** The red focus letter: the middle letter, leaning left on even lengths
 * ("you" → o, "speed" → e). Punctuation and spaces are skipped over. */
export function pivotIndex(text: string): number {
  const letterIdx = [...text].map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0);
  if (letterIdx.length === 0) return 0;
  return letterIdx[Math.ceil(letterIdx.length / 2) - 1];
}

/** How long a chunk stays on screen, in ms. */
export function chunkDelay(chunk: Chunk, s: Settings, wpm: number): number {
  const perWord = 60000 / wpm;
  let ms = s.smartTiming
    ? chunk.words.reduce((t, w) => t + perWord * familiarity(w.text), 0)
    : perWord * chunk.words.length;

  if (s.slowLongWords && !s.smartTiming) {
    for (const w of chunk.words) {
      const extra = Math.max(0, w.text.length - 8);
      ms += perWord * Math.min(0.9, extra * 0.1);
    }
  }

  const last = chunk.words[chunk.words.length - 1];
  if (last.paraEnd) ms += perWord * (s.paragraphPause - 1);
  else if (SENTENCE_END.test(last.text)) ms += perWord * (s.sentencePause - 1);
  else if (CLAUSE_END.test(last.text)) ms += perWord * (s.commaPause - 1);

  return ms;
}

/** Ramp: start at half speed and ease up to full over `rampSeconds`. */
export function effectiveWpm(s: Settings, playedMs: number): number {
  if (s.rampSeconds <= 0) return s.wpm;
  const t = Math.min(1, playedMs / (s.rampSeconds * 1000));
  return s.wpm * (0.5 + 0.5 * t);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
