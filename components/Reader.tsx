"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Starfield } from "./Starfield";
import { SettingsPanel } from "./SettingsPanel";
import { LibraryPanel } from "./LibraryPanel";
import { chunkDelay, chunkWords, effectiveWpm, formatDuration, pivotIndex, tokenize } from "@/lib/rsvp";
import { FONT_STACKS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { addDoc, getCurrentId, getMeta, getText, listDocs, migrateLegacy, savePos, setCurrentId } from "@/lib/library";

const SAMPLE = `Speed reading this way works because your eyes stop moving. Normally they jump from word to word, and every jump costs time.

Here each word lands in the same spot, lined up on its focus letter, the red one, so you just keep looking at the gap between the marks.

Start around three hundred words per minute, then push it up. Open the Library to paste text, import a link, or open a PDF or EPUB, and open Settings to change the speed, how many words show at once, the pauses, the font, the colors, and the stars. Space plays and pauses.`;

export function Reader() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [text, setText] = useState(SAMPLE);
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState("Welcome");
  const [wordIndex, setWordIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const words = useMemo(() => tokenize(text), [text]);
  const chunks = useMemo(() => chunkWords(words, settings.wordsPerFlash), [words, settings.wordsPerFlash]);

  // Chunk containing the current word (binary search on chunk starts).
  const chunkIndex = useMemo(() => {
    let lo = 0;
    let hi = chunks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (chunks[mid].start <= wordIndex) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(0, lo);
  }, [chunks, wordIndex]);
  const chunk = chunks[chunkIndex];

  // remaining[i] = ms to read chunks i..end at full speed, for the time-left readout.
  const remaining = useMemo(() => {
    const out = new Array<number>(chunks.length + 1).fill(0);
    for (let i = chunks.length - 1; i >= 0; i--) out[i] = out[i + 1] + chunkDelay(chunks[i], settings, settings.wpm);
    return out;
  }, [chunks, settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ---------- library ----------
  const openDoc = useCallback(async (id: string) => {
    const [meta, body] = await Promise.all([getMeta(id), getText(id)]);
    if (!meta || body === undefined) return false;
    setPlaying(false);
    setCountdown(0);
    setText(body);
    setTitle(meta.title);
    setDocId(id);
    setWordIndex(Math.min(meta.pos, Math.max(0, meta.wordCount - 1)));
    setCurrentId(id);
    return true;
  }, []);

  const openNewestOrSample = useCallback(async () => {
    const [newest] = await listDocs();
    if (newest && (await openDoc(newest.id))) return;
    setText(SAMPLE);
    setTitle("Welcome");
    setDocId(null);
    setWordIndex(0);
  }, [openDoc]);

  useEffect(() => {
    (async () => {
      await migrateLegacy();
      const id = getCurrentId();
      if (!(id && (await openDoc(id)))) await openNewestOrSample();
    })().catch(() => {
      /* IndexedDB unavailable (private mode on some browsers): stay on the sample */
    });
  }, [openDoc, openNewestOrSample]);

  // Remember the reading position, at most once a second.
  useEffect(() => {
    if (!docId) return;
    const t = setTimeout(() => savePos(docId, wordIndex).catch(() => {}), 1000);
    return () => clearTimeout(t);
  }, [docId, wordIndex]);

  const addAndOpen = async (newTitle: string, body: string, source?: string) => {
    const meta = await addDoc(newTitle, body, source);
    await openDoc(meta.id);
  };

  const handleDeleted = (id: string) => {
    if (id === docId) openNewestOrSample();
  };

  // ---------- playback ----------
  const playedMs = useRef(0);

  useEffect(() => {
    if (!playing || !chunk) return;
    const delay = chunkDelay(chunk, settings, effectiveWpm(settings, playedMs.current));
    const t = setTimeout(() => {
      playedMs.current += delay;
      const next = chunks[chunkIndex + 1];
      if (next) setWordIndex(next.start);
      else if (settings.loop) setWordIndex(0);
      else setPlaying(false);
    }, delay);
    return () => clearTimeout(t);
  }, [playing, chunk, chunkIndex, chunks, settings]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) setPlaying(true);
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const play = useCallback(() => {
    if (!chunks.length) return;
    if (chunkIndex >= chunks.length - 1) setWordIndex(0);
    playedMs.current = 0;
    if (settings.countdown > 0) setCountdown(settings.countdown);
    else setPlaying(true);
  }, [chunks.length, chunkIndex, settings.countdown]);

  const pause = useCallback(() => {
    setPlaying(false);
    setCountdown(0);
  }, []);

  const toggle = useCallback(() => (playing || countdown ? pause() : play()), [playing, countdown, pause, play]);

  const step = useCallback(
    (n: number) => {
      pause();
      const target = Math.max(0, Math.min(chunks.length - 1, chunkIndex + n));
      setWordIndex(chunks[target]?.start ?? 0);
    },
    [pause, chunks, chunkIndex]
  );

  const restart = useCallback(() => {
    pause();
    setWordIndex(0);
  }, [pause]);

  // ---------- phone niceties ----------
  // iPhone Safari has no Fullscreen API: hide the button there.
  const [canFullscreen] = useState(() => typeof document !== "undefined" && document.fullscreenEnabled);

  // Keep the screen on while words are flashing.
  useEffect(() => {
    if (!playing || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) l.release();
          else lock = l;
        })
        .catch(() => {});
    acquire();
    // The lock drops when the tab is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [playing]);

  // Tap the stage to play/pause; swipe sideways to step through words.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    swiped.current = false;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped.current = true; // swallow the click that follows
      const n = Math.max(1, Math.round(Math.abs(dx) / 60));
      step(dx < 0 ? n : -n);
    }
  };
  const onStageClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    toggle();
  };

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (libraryOpen) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range" && (e.target as HTMLInputElement).type !== "checkbox") return;
      switch (e.key) {
        case " ": e.preventDefault(); toggle(); break;
        case "ArrowLeft": e.preventDefault(); step(e.shiftKey ? -10 : -1); break;
        case "ArrowRight": e.preventDefault(); step(e.shiftKey ? 10 : 1); break;
        case "ArrowUp": e.preventDefault(); update({ wpm: Math.min(1500, settings.wpm + 25) }); break;
        case "ArrowDown": e.preventDefault(); update({ wpm: Math.max(100, settings.wpm - 25) }); break;
        case "[": update({ wordsPerFlash: Math.max(1, settings.wordsPerFlash - 1) }); break;
        case "]": update({ wordsPerFlash: Math.min(5, settings.wordsPerFlash + 1) }); break;
        case "r": case "R": restart(); break;
        case "t": case "T": case "l": case "L": e.preventDefault(); pause(); setLibraryOpen(true); break;
        case "s": case "S": setSettingsOpen((o) => !o); break;
        case "f": case "F": fullscreen(); break;
        case "Escape": setSettingsOpen(false); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [libraryOpen, toggle, step, restart, pause, update, settings.wpm, settings.wordsPerFlash]);

  // ---------- word layout ----------
  const display = chunk?.text ?? "";
  const p = pivotIndex(display);
  const wordRef = useRef<HTMLDivElement>(null);

  // Fit long flashes on screen, then centre the focus letter on the tick.
  useLayoutEffect(() => {
    const el = wordRef.current;
    if (!el) return;
    const fit = () => {
      const [left, mid, right] = Array.from(el.children) as HTMLElement[];
      el.style.fontSize = `${settings.fontSize}px`;
      const w = el.clientWidth;
      const room = 24;
      const leftRoom = (w * settings.focusPosition) / 100 - room;
      const rightRoom = w - (w * settings.focusPosition) / 100 - room;
      const scale = Math.min(
        1,
        left.offsetWidth ? leftRoom / (left.offsetWidth + mid.offsetWidth / 2) : 1,
        rightRoom / (right.offsetWidth + mid.offsetWidth / 2 || 1)
      );
      if (scale < 1) el.style.fontSize = `${Math.floor(settings.fontSize * scale)}px`;
      el.style.setProperty("--nudge", `${-mid.getBoundingClientRect().width / 2}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [display, settings.fontSize, settings.focusPosition, settings.font]);

  // Sentence around the current flash, for the optional context line.
  const context = useMemo(() => {
    if (!settings.showContext || !chunk) return null;
    const ends = (i: number) => words[i].paraEnd || /[.!?]["'”’)\]]*$/.test(words[i].text);
    let a = chunk.start;
    while (a > 0 && !ends(a - 1) && chunk.start - a < 40) a--;
    let b = chunk.start + chunk.words.length - 1;
    while (b < words.length - 1 && !ends(b) && b - chunk.start < 40) b++;
    const join = (from: number, to: number) => words.slice(from, to).map((w) => w.text).join(" ");
    return {
      before: join(a, chunk.start),
      current: chunk.text,
      after: join(chunk.start + chunk.words.length, b + 1),
    };
  }, [settings.showContext, chunk, words]);

  const progress = chunks.length ? (chunkIndex + 1) / chunks.length : 0;
  const isActive = playing || countdown > 0;

  return (
    <main
      className={`reader${settings.showGuides ? "" : " reader--no-guides"}`}
      style={{
        ["--pivot-x" as string]: `${settings.focusPosition}%`,
        ["--pivot" as string]: settings.focusColor,
        ["--reader-font" as string]: FONT_STACKS[settings.font],
      }}
    >
      {settings.stars && <Starfield density={settings.starDensity} motion={settings.starMotion} />}

      <div className="hud">
        <div className="hud__group">
          <button className="icon-btn" onClick={toggle} aria-label={isActive ? "Pause" : "Play"}>
            {isActive ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon-btn" onClick={restart} aria-label="Restart">
            <RestartIcon />
          </button>
        </div>
        <label className="pill hud__speed">
          <input type="range" min={100} max={1500} step={25} value={settings.wpm}
            onChange={(e) => update({ wpm: Number(e.target.value) })} aria-label="Words per minute" />
          <output>{settings.wpm} wpm</output>
        </label>
        <span className="hud__spacer" />
        <div className="hud__group hud__group--pill">
          <button className="text-btn" onClick={() => { pause(); setLibraryOpen(true); }}>Library</button>
          <button className="text-btn" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}>
            Settings
          </button>
          {canFullscreen && (
            <button className="icon-btn icon-btn--flat" onClick={fullscreen} aria-label="Fullscreen">
              <FullscreenIcon />
            </button>
          )}
        </div>
      </div>

      <div className="stage" onClick={onStageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {countdown > 0 ? (
          <div className="word word--count" key={countdown}>
            <span />
            <span className="mid">{countdown}</span>
            <span />
          </div>
        ) : (
          <div className="word" ref={wordRef} style={{ fontFamily: "var(--reader-font)" }}>
            <span className="left">{display.slice(0, p)}</span>
            <span className={settings.showFocus ? "mid" : ""}>{display.slice(p, p + 1)}</span>
            <span className="right">{display.slice(p + 1)}</span>
          </div>
        )}
      </div>

      {context && (
        <p className="context">
          {context.before} <mark>{context.current}</mark> {context.after}
        </p>
      )}

      <div className="meta">
        <span className="meta__doc">
          <span className="meta__title">{title}</span>
          {words.length ? ` · ${(chunk?.start ?? 0) + 1} / ${words.length.toLocaleString()} words` : ""}
        </span>
        <span>{formatDuration(remaining[chunkIndex + 1] ?? 0)} left</span>
      </div>

      <div
        className="progress"
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={words.length}
        aria-valuenow={chunk?.start ?? 0}
        tabIndex={-1}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const target = Math.floor(((e.clientX - r.left) / r.width) * chunks.length);
          setWordIndex(chunks[Math.max(0, Math.min(chunks.length - 1, target))]?.start ?? 0);
        }}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <SettingsPanel open={settingsOpen} settings={settings} onChange={update} onClose={() => setSettingsOpen(false)} />
      <LibraryPanel
        open={libraryOpen}
        currentId={docId}
        wpm={settings.wpm}
        onOpenDoc={openDoc}
        onAdd={addAndOpen}
        onDeleted={handleDeleted}
        onClose={() => setLibraryOpen(false)}
      />
    </main>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
  </svg>
);
const RestartIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v5h5" />
  </svg>
);
const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
