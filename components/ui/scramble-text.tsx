"use client";

import { useEffect, useRef, useState } from "react";

interface ScrambleTextProps {
  text: string;
  characters?: string;
  duration?: number;
  delay?: number;
  trigger?: boolean;
  className?: string;
}

export function ScrambleText({
  text,
  characters = "[]░▒▓█▀▄⣿",
  duration = 600,
  delay = 0,
  trigger = true,
  className,
}: ScrambleTextProps) {
  const [display, setDisplay] = useState("");
  const frameRef = useRef(0);
  const lastTickRef = useRef(0);
  const resolveTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!trigger) {
      setDisplay(text);
      return;
    }

    // each character gets a resolve time: positional wave + randomness
    resolveTimesRef.current = Array.from({ length: text.length }, (_, i) => {
      const posWeight = i / Math.max(text.length - 1, 1);
      const rand = Math.random() * 0.5;
      return delay + duration * (posWeight * 0.5 + rand * 0.5);
    });

    const start = performance.now();
    lastTickRef.current = 0;

    function tick(now: number) {
      const elapsed = now - start;

      // throttle to ~50ms for the choppy scramble feel
      if (now - lastTickRef.current < 50) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTickRef.current = now;

      const chars = text.split("").map((char, i) => {
        if (char === " ") return " ";
        if (elapsed >= resolveTimesRef.current[i]) return char;
        return characters[Math.floor(Math.random() * characters.length)];
      });

      setDisplay(chars.join(""));

      if (resolveTimesRef.current.some((t) => elapsed < t)) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [text, characters, duration, delay, trigger]);

  return <span className={className}>{display}</span>;
}
