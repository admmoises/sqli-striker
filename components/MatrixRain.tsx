"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Canvas matrix rain — half-width katakana + hex digits, blood red,
 * decaying trail. Pinned behind everything else.
 *
 * Performance: targets ~30fps with capped column count, single rAF loop,
 * DPR-aware sizing. Disabled on viewports < 640px to save battery/CPU.
 */
export function MatrixRain(): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enabled, setEnabled] = useState<boolean>(false);

  // Gate render behind a media-query so mobile viewports skip the canvas
  // entirely. We react to resize so rotating a tablet from portrait to
  // landscape (or toggling devtools) re-enables it correctly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setEnabled(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setEnabled(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Half-width katakana + hex + a few terminal glyphs.
    const glyphs =
      "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ0123456789ABCDEF<>/\\|=+*!?#$";
    const glyphArr = glyphs.split("");

    const FONT_SIZE = 16;
    const FPS = 30;
    const FRAME_MS = 1000 / FPS;

    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    let dpr = Math.min(window.devicePixelRatio ?? 1, 2);

    const resize = (): void => {
      dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.floor(width / FONT_SIZE);
      // Seed at random vertical offset so the field doesn't all start at row 0.
      drops = new Array<number>(columns)
        .fill(0)
        .map(() => Math.floor(Math.random() * (height / FONT_SIZE)));
      // Paint initial black so we don't see clear-flash on first frame.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
    };
    resize();

    // Debounce resize — multiple rapid resize events (mobile rotate, devtools
    // toggle) would otherwise allocate fresh drops arrays each tick.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = (): void => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        resize();
      }, 100);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let last = 0;
    let running = true;
    let paused = false;

    const draw = (now: number): void => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;

      // Trail decay — semi-transparent black wash.
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${FONT_SIZE}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";

      for (let i = 0; i < columns; i++) {
        const ch = glyphArr[(Math.random() * glyphArr.length) | 0];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        // Head glyph is bright neon; trail is deeper red.
        if (Math.random() < 0.04) {
          ctx.fillStyle = "rgba(245, 240, 232, 0.9)";
        } else if (Math.random() < 0.18) {
          ctx.fillStyle = "rgba(255, 23, 68, 0.9)";
        } else {
          ctx.fillStyle = "rgba(255, 0, 51, 0.55)";
        }
        ctx.fillText(ch, x, y);

        // Reset unconditionally on overflow — visually indistinguishable from
        // the old `Math.random() > 0.975` gate (drops were already off-screen),
        // but removes an unbounded counter that grew forever on hidden tabs.
        if (y > height) {
          drops[i] = 0;
        } else {
          drops[i]++;
        }
      }
    };

    // Pause the rAF loop while the tab is hidden — saves CPU and avoids the
    // browser's coarse background rAF throttling causing big delta jumps.
    const onVisibility = (): void => {
      if (document.hidden) {
        if (!paused) {
          paused = true;
          cancelAnimationFrame(raf);
        }
      } else if (paused) {
        paused = false;
        last = 0;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (resizeTimer !== null) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1, opacity: 0.55 }}
    />
  );
}
