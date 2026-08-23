"use client";

import { useSyncExternalStore } from "react";

/**
 * Paylaşılan saat: aynı aralığa abone olan tüm sayaçlar tek bir interval
 * üzerinden tetiklenir (bileşen başına zamanlayıcı açılmaz).
 */
function makeClock(intervalMs: number) {
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let now = 0;

  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      if (timer === null) {
        now = Date.now();
        timer = setInterval(() => {
          now = Date.now();
          listeners.forEach((l) => l());
        }, intervalMs);
      }
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot() {
      if (now === 0) now = Date.now();
      return now;
    },
    getServerSnapshot() {
      return 0;
    },
  };
}

const secondClock = makeClock(1000);
const minuteClock = makeClock(30000);

function useNow(clock: ReturnType<typeof makeClock>) {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getServerSnapshot);
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Verilen başlangıç anından itibaren saniye saniye ilerleyen sayaç. */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const start = new Date(since).getTime();
  const now = useNow(secondClock);

  return (
    <span className={`tabular ${className ?? ""}`} suppressHydrationWarning>
      {formatElapsed(now === 0 ? 0 : now - start)}
    </span>
  );
}

/** Koç panelinde "23 dk'dır çalışıyor" biçimi. */
export function ElapsedShort({ since }: { since: string }) {
  const start = new Date(since).getTime();
  const now = useNow(minuteClock);
  const minutes = now === 0 ? 0 : Math.max(0, Math.floor((now - start) / 60000));

  return (
    <span suppressHydrationWarning>
      {minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`}
    </span>
  );
}
