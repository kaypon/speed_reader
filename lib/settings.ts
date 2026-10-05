export type FontChoice = "sans" | "serif" | "mono";

export type Settings = {
  wpm: number;
  wordsPerFlash: number;
  rampSeconds: number;
  sentencePause: number;
  commaPause: number;
  paragraphPause: number;
  slowLongWords: boolean;
  smartTiming: boolean;
  countdown: number;

  fontSize: number;
  font: FontChoice;
  showFocus: boolean;
  focusColor: string;
  showGuides: boolean;
  focusPosition: number;

  stars: boolean;
  starDensity: number;
  starMotion: number;

  showContext: boolean;
  loop: boolean;
};

export const DEFAULTS: Settings = {
  wpm: 300,
  wordsPerFlash: 1,
  rampSeconds: 0,
  sentencePause: 2.2,
  commaPause: 1.5,
  paragraphPause: 3,
  slowLongWords: true,
  smartTiming: true,
  countdown: 0,

  fontSize: 110,
  font: "sans",
  showFocus: true,
  focusColor: "#e8453c",
  showGuides: true,
  focusPosition: 38,

  stars: true,
  starDensity: 1,
  starMotion: 1,

  showContext: false,
  loop: false,
};

export const FONT_STACKS: Record<FontChoice, string> = {
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SF Mono", Menlo, Consolas, monospace',
};

export const FOCUS_COLORS = ["#e8453c", "#f5b942", "#4fc3f7", "#7ddc7a", "#ffffff"];

const KEY = "speed-reader:settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage full: settings just won't persist */
  }
}
