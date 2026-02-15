import { useEffect, useRef } from "react";

type StarPoint = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

const POINT_COUNT = 40;
const MAX_LINK_DISTANCE = 160;

export function ConstellationBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      context = null;
    }
    if (!context) {
      return;
    }

    let width = 0;
    let height = 0;
    let frame = 0;
    let rafId = 0;
    const points: StarPoint[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resetPoints = () => {
      points.length = 0;
      for (let i = 0; i < POINT_COUNT; i += 1) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          radius: 1 + Math.random() * 1.3
        });
      }
    };

    const distance = (a: StarPoint, b: StarPoint) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    };

    const draw = () => {
      frame += 1;
      context.clearRect(0, 0, width, height);

      for (const point of points) {
        point.x += point.vx;
        point.y += point.vy;

        if (point.x < 0 || point.x > width) {
          point.vx *= -1;
        }
        if (point.y < 0 || point.y > height) {
          point.vy *= -1;
        }
      }

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          const d = distance(a, b);
          if (d > MAX_LINK_DISTANCE) {
            continue;
          }
          const alpha = 0.22 * (1 - d / MAX_LINK_DISTANCE);
          context.strokeStyle = `rgba(160, 190, 255, ${alpha})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }

      // Fill subtle moving triangles by using each point's two closest neighbors.
      if (frame % 2 === 0) {
        for (let i = 0; i < points.length; i += 1) {
          const base = points[i];
          const neighbors = points
            .map((p, idx) => ({ idx, d: distance(base, p) }))
            .filter((entry) => entry.idx !== i && entry.d < MAX_LINK_DISTANCE * 0.82)
            .sort((a, b) => a.d - b.d)
            .slice(0, 2);
          if (neighbors.length < 2) {
            continue;
          }
          const p1 = points[neighbors[0].idx];
          const p2 = points[neighbors[1].idx];
          context.fillStyle = "rgba(120, 150, 220, 0.045)";
          context.beginPath();
          context.moveTo(base.x, base.y);
          context.lineTo(p1.x, p1.y);
          context.lineTo(p2.x, p2.y);
          context.closePath();
          context.fill();
        }
      }

      for (const point of points) {
        context.fillStyle = "rgba(210, 225, 255, 0.9)";
        context.beginPath();
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fill();
      }

      rafId = window.requestAnimationFrame(draw);
    };

    resize();
    resetPoints();
    rafId = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="constellation-canvas" ref={canvasRef} aria-hidden="true" />;
}
