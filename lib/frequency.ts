/** Smart timing: the brain recognises very common words almost instantly
 * and needs longer for rare ones, so flash time scales with how familiar a
 * word is instead of only its length. */

// The ~200 most frequent English words (function words and everyday verbs).
const COMMON = new Set(
  `the of and a to in is you that it he was for on are as with his they i at be this have from or one had by
  word but not what all were we when your can said there use an each which she do how their if will up other
  about out many then them these so some her would make like him into time has look two more write go see
  number no way could people my than first water been call who oil its now find long down day did get come
  made may part over new sound take only little work know place year live me back give most very after thing
  our just name good sentence man think say great where help through much before line right too mean old any
  same tell boy follow came want show also around form three small set put end does another well large must
  big even such because turn here why ask went men read need land different home us move try kind hand
  picture again change off play spell air away animal house point page letter mother answer found study still
  learn should world high every near add food between own below country plant last school father keep tree
  never start city earth eye light thought head under story saw left few while along might close something
  seem next hard open example begin life always those both paper together got group often run`
    .split(/\s+/)
    .filter(Boolean)
);

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "").replace(/'s$/, "");

/** Multiplier on a word's base time: 0.75× for common short words, up to
 * 1.35× for long unfamiliar ones, 1× otherwise. */
export function familiarity(word: string): number {
  const w = bare(word);
  if (!w) return 1;
  if (COMMON.has(w)) return w.length <= 4 ? 0.75 : 0.9;
  if (/^\d/.test(w)) return 1.2; // numbers take a beat to parse
  if (w.length >= 10) return 1.35;
  if (w.length >= 7) return 1.15;
  return 1;
}
