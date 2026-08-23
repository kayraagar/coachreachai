"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "./Icons";

type Theme = "light" | "dark";

/** Tema, DOM üzerindeki data-theme özniteliğinde tutulur; burada yalnızca
 *  o dış duruma abone olunur (kopya state yok, hidrasyonda sapma olmaz). */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme) || "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("yks-theme", next);
  } catch {
    /* gizli sekme — sessizce geç */
  }
  listeners.forEach((cb) => cb());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"}
      title={dark ? "Açık tema" : "Koyu tema"}
      className="btn btn-ghost !px-2.5 !py-2 overflow-hidden"
    >
      <span
        key={theme}
        className="animate-pop grid place-items-center"
        style={{ ["--d" as string]: "0ms" }}
      >
        {dark ? <IconSun /> : <IconMoon />}
      </span>
    </button>
  );
}
