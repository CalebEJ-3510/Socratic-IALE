import { useCallback, useEffect, useState } from "react";

export type ThemeName = "blueprint" | "overcast";

export const THEME_KEY = "iale_theme";

/** Inline script injected into <head> so the theme lands before first paint. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'overcast':'blueprint';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t==='overcast'?'light':'dark';}catch(e){}})();`;

function readTheme(): ThemeName {
  if (typeof window === "undefined") return "blueprint";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "overcast" || stored === "blueprint") return stored;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "overcast" : "blueprint";
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme === "overcast" ? "light" : "dark";
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>("blueprint");

  useEffect(() => {
    const t = readTheme();
    setThemeState(t);
    applyTheme(t);
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(readTheme() === "overcast" ? "blueprint" : "overcast"),
    [setTheme],
  );

  return { theme, setTheme, toggle };
}
