"use client";

import type { ReactNode } from "react";
import { DEFAULTS, FOCUS_COLORS, type FontChoice, type Settings } from "@/lib/settings";

type Props = {
  open: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
};

export function SettingsPanel({ open, settings: s, onChange, onClose }: Props) {
  return (
    <aside className={`drawer${open ? " drawer--open" : ""}`} aria-hidden={!open} inert={!open}>
      <header className="drawer__head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      <Section title="Speed">
        <Slider label="Words per minute" value={s.wpm} min={100} max={1500} step={25}
          format={(v) => `${v}`} onChange={(wpm) => onChange({ wpm })} />
        <Slider label="Words at a time" value={s.wordsPerFlash} min={1} max={5} step={1}
          format={(v) => `${v}`} onChange={(wordsPerFlash) => onChange({ wordsPerFlash })} />
        <Slider label="Warm-up" hint="Start at half speed and ramp up" value={s.rampSeconds}
          min={0} max={60} step={5} format={(v) => (v ? `${v}s` : "off")}
          onChange={(rampSeconds) => onChange({ rampSeconds })} />
        <Slider label="Countdown" value={s.countdown} min={0} max={5} step={1}
          format={(v) => (v ? `${v}s` : "off")} onChange={(countdown) => onChange({ countdown })} />
      </Section>

      <Section title="Pauses">
        <Slider label="End of sentence" value={s.sentencePause} min={1} max={4} step={0.1}
          format={(v) => `${v.toFixed(1)}×`} onChange={(sentencePause) => onChange({ sentencePause })} />
        <Slider label="Commas" value={s.commaPause} min={1} max={3} step={0.1}
          format={(v) => `${v.toFixed(1)}×`} onChange={(commaPause) => onChange({ commaPause })} />
        <Slider label="New paragraph" value={s.paragraphPause} min={1} max={6} step={0.1}
          format={(v) => `${v.toFixed(1)}×`} onChange={(paragraphPause) => onChange({ paragraphPause })} />
        <Toggle label="Smart timing" checked={s.smartTiming}
          onChange={(smartTiming) => onChange({ smartTiming })} />
        <p className="field__hint field__hint--block">
          Common words like &ldquo;the&rdquo; flash faster, rare and long words stay longer.
        </p>
        {!s.smartTiming && (
          <Toggle label="Slow down on long words" checked={s.slowLongWords}
            onChange={(slowLongWords) => onChange({ slowLongWords })} />
        )}
      </Section>

      <Section title="Text">
        <Slider label="Size" value={s.fontSize} min={40} max={200} step={5}
          format={(v) => `${v}px`} onChange={(fontSize) => onChange({ fontSize })} />
        <Segmented<FontChoice> label="Font" value={s.font}
          options={[["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]]}
          onChange={(font) => onChange({ font })} />
        <Toggle label="Focus letter" checked={s.showFocus} onChange={(showFocus) => onChange({ showFocus })} />
        <div className="field">
          <span className="field__label">Focus color</span>
          <div className="swatches">
            {FOCUS_COLORS.map((c) => (
              <button key={c} className={`swatch${s.focusColor === c ? " swatch--on" : ""}`}
                style={{ background: c }} aria-label={`Focus color ${c}`}
                onClick={() => onChange({ focusColor: c })} />
            ))}
          </div>
        </div>
        <Slider label="Focus position" hint="Where the marks sit across the screen"
          value={s.focusPosition} min={20} max={60} step={1} format={(v) => `${v}%`}
          onChange={(focusPosition) => onChange({ focusPosition })} />
        <Toggle label="Guide lines" checked={s.showGuides} onChange={(showGuides) => onChange({ showGuides })} />
        <Toggle label="Show surrounding sentence" checked={s.showContext}
          onChange={(showContext) => onChange({ showContext })} />
      </Section>

      <Section title="Background">
        <Toggle label="Stars" checked={s.stars} onChange={(stars) => onChange({ stars })} />
        <Slider label="Star density" value={s.starDensity} min={0.2} max={3} step={0.1}
          format={(v) => `${v.toFixed(1)}×`} onChange={(starDensity) => onChange({ starDensity })} />
        <Slider label="Star motion" value={s.starMotion} min={0} max={4} step={0.1}
          format={(v) => (v ? `${v.toFixed(1)}×` : "still")} onChange={(starMotion) => onChange({ starMotion })} />
      </Section>

      <Section title="Playback">
        <Toggle label="Loop when finished" checked={s.loop} onChange={(loop) => onChange({ loop })} />
      </Section>

      <button className="btn btn--ghost drawer__reset" onClick={() => onChange(DEFAULTS)}>
        Reset to defaults
      </button>

      <dl className="keys">
        <dt>Space</dt><dd>play / pause</dd>
        <dt>← →</dt><dd>back / forward (shift: 10)</dd>
        <dt>↑ ↓</dt><dd>speed ±25</dd>
        <dt>[ ]</dt><dd>words at a time</dd>
        <dt>R</dt><dd>restart</dd>
        <dt>L</dt><dd>library / add text</dd>
        <dt>S</dt><dd>settings</dd>
        <dt>F</dt><dd>fullscreen</dd>
      </dl>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Slider(props: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {props.label}
        <output>{props.format(props.value)}</output>
      </span>
      {props.hint && <span className="field__hint">{props.hint}</span>}
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field field--row">
      <span className="field__label">{props.label}</span>
      <input type="checkbox" className="switch" checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)} />
    </label>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field__label">{props.label}</span>
      <div className="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={props.value === v}
            className={props.value === v ? "on" : ""} onClick={() => props.onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
