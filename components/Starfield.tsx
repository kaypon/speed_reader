"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  warm: boolean;
  phase: number;
  speed: number;
  drift: number;
};

/** Twinkling, slowly drifting stars: blue-white with some pale yellow,
 * a few big ones with a soft halo. */
export function Starfield({ density, motion }: { density: number; motion: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef(motion);

  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let stars: Star[] = [];
    let raf = 0;
    let last = performance.now();
    let clock = 0;

    const seed = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(((innerWidth * innerHeight) / 4500) * density);
      stars = Array.from({ length: n }, () => {
        const big = Math.random() < 0.06;
        return {
          x: Math.random() * innerWidth,
          y: Math.random() * innerHeight,
          r: big ? 2 + Math.random() * 2 : 0.7 + Math.random() * 1.1,
          warm: Math.random() < 0.35,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 1.2,
          drift: 2 + Math.random() * 6,
        };
      });
    };

    const draw = (now: number) => {
      clock += ((now - last) / 1000) * motionRef.current;
      last = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const s of stars) {
        const a = 0.55 + 0.45 * Math.sin(s.phase + clock * s.speed);
        const y = (((s.y - clock * s.drift) % innerHeight) + innerHeight) % innerHeight;
        if (s.r > 1.9) {
          ctx.fillStyle = s.warm ? `rgba(255,220,120,${0.15 * a})` : `rgba(110,110,255,${0.25 * a})`;
          ctx.beginPath();
          ctx.arc(s.x, y, s.r * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = s.warm ? `rgba(255,226,140,${a})` : `rgba(235,235,255,${a})`;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    seed();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", seed);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", seed);
    };
  }, [density]);

  return <canvas ref={ref} className="stars" aria-hidden />;
}
