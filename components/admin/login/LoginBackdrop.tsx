"use client";

/**
 * components/admin/login/LoginBackdrop.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The sign-in page's backdrop: deep navy lit from the top-left, 22 sine
 * lines across the lower half (every fifth one sand) and a few sand
 * points twinkling above them — the mockup's `#waves`, ported.
 *
 * Decoration only, so it is aria-hidden and takes no pointer events; the
 * pointer is read from the window instead, to tilt the waves a little.
 *
 * Cheap by construction: device-pixel-ratio sizing from a ResizeObserver,
 * the animation paused while the tab is hidden, one still frame and no
 * loop under prefers-reduced-motion, and everything torn down on unmount.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";

const LINES = 22;
const DOTS = 26;

export default function LoginBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let time = 0;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < LINES; i++) {
        const base = height * 0.42 + i * height * 0.022;
        const amplitude = 10 + i * 1.6;
        context.beginPath();
        for (let x = 0; x <= width; x += 8) {
          const y =
            base +
            Math.sin(x * 0.006 + time + i * 0.35) * amplitude +
            Math.sin(x * 0.013 - time * 1.3 + i) * amplitude * 0.4 +
            (pointerY - 0.5) * i * 3 * Math.sin((x / width) * Math.PI);
          context.lineTo(x, y);
        }
        const sand = i % 5 === 0;
        context.strokeStyle = sand
          ? `rgba(232,179,132,${0.18 + pointerX * 0.25})`
          : `rgba(143,181,204,${0.06 + (i / LINES) * 0.16})`;
        context.lineWidth = sand ? 1.4 : 1;
        context.stroke();
      }
      for (let k = 0; k < DOTS; k++) {
        const x = (k * 137.5 + time * 12) % width;
        const y = ((k * 91.3) % (height * 0.4)) + 20;
        context.fillStyle = `rgba(232,179,132,${0.15 + 0.25 * Math.sin(time * 2 + k) ** 2})`;
        context.beginPath();
        context.arc(x, y, 1.2, 0, Math.PI * 2);
        context.fill();
      }
    };

    const loop = () => {
      draw();
      time += 0.006;
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (reduce || document.hidden) draw();
      else frame = requestAnimationFrame(loop);
    };

    const onPointer = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth;
      pointerY = event.clientY / window.innerHeight;
      if (reduce) draw();
    };

    const observer = new ResizeObserver(() => {
      fit();
      draw();
    });
    observer.observe(canvas);
    fit();
    start();

    document.addEventListener("visibilitychange", start);
    window.addEventListener("pointermove", onPointer);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,#0d4a6e_0%,#083551_45%,#041d2c_100%)]"
    >
      <canvas ref={canvasRef} data-login-backdrop className="h-full w-full" />
    </div>
  );
}
