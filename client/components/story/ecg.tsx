"use client";

import { useEffect, useRef } from "react";

/**
 * A patient-monitor trace drawn on canvas. Healthy beats in green; every few beats one arrives
 * malformed and red while the readout still says "200 OK": the silent failure, made visible.
 */
export function Ecg({ className, failEvery = 5, height = 160 }: { className?: string; failEvery?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const healthy = css.getPropertyValue("--healthy").trim() || "oklch(0.84 0.19 155)";
    const infected = css.getPropertyValue("--infected").trim() || "oklch(0.68 0.22 25)";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const monoFont = css.getPropertyValue("--font-jetbrains-mono").trim() || "ui-monospace, monospace";

    let w = 0;
    const h = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const beatLen = 150; // px per beat
    // One beat as (x fraction, y offset) points; the failing beat is irregular and too tall.
    const good: [number, number][] = [[0, 0], [0.32, 0], [0.38, -6], [0.44, 0], [0.5, 4], [0.54, -52], [0.58, 14], [0.63, 0], [0.76, -10], [0.86, 0], [1, 0]];
    const bad: [number, number][] = [[0, 0], [0.3, 0], [0.36, 9], [0.43, -18], [0.47, 22], [0.52, -64], [0.55, 30], [0.6, -12], [0.66, 6], [0.8, -3], [1, 0]];
    const yAt = (pts: [number, number][], f: number) => {
      for (let i = 1; i < pts.length; i++) {
        if (f <= pts[i][0]) {
          const [x0, y0] = pts[i - 1];
          const [x1, y1] = pts[i];
          return y0 + ((f - x0) / (x1 - x0 || 1)) * (y1 - y0);
        }
      }
      return 0;
    };

    let offset = 0;
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!reduce) offset += dt * 0.09;
      ctx.clearRect(0, 0, w, h);
      const mid = h * 0.62;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      // Draw beat by beat so each beat can carry its own colour.
      const first = Math.floor(offset / beatLen);
      for (let b = first; b * beatLen - offset < w + beatLen; b++) {
        const isBad = b % failEvery === failEvery - 1;
        const pts = isBad ? bad : good;
        ctx.beginPath();
        for (let x = 0; x <= beatLen; x += 2) {
          const sx = b * beatLen - offset + x;
          if (sx < -2 || sx > w + 2) continue;
          const y = mid + yAt(pts, x / beatLen);
          if (x === 0 || sx < 0) ctx.moveTo(sx, y);
          else ctx.lineTo(sx, y);
        }
        ctx.strokeStyle = isBad ? infected : healthy;
        ctx.shadowColor = isBad ? infected : healthy;
        ctx.shadowBlur = 10;
        ctx.stroke();
        // The readout under every beat says the same thing.
        const labelX = b * beatLen - offset + beatLen * 0.48;
        if (labelX > 0 && labelX < w - 40) {
          ctx.shadowBlur = 0;
          ctx.font = `11px ${monoFont}`;
          ctx.fillStyle = isBad ? infected : "rgba(200,220,230,0.45)";
          ctx.fillText("200 OK", labelX - 18, h - 10);
        }
      }
      // Fade the leading edge like a sweeping monitor.
      const grad = ctx.createLinearGradient(w - 120, 0, w, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(10,16,20,1)");
      ctx.shadowBlur = 0;
      ctx.fillStyle = grad;
      ctx.fillRect(w - 120, 0, 120, h);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [failEvery, height]);

  return <canvas ref={ref} className={className} style={{ width: "100%", height }} aria-hidden />;
}
