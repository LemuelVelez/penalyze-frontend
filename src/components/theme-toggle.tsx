import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

const THEME_CHANGE_EVENT = "penalyze:theme-change";

type Theme = "light" | "dark";

function getTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.classList.add("theme-switching");
  root.classList.toggle("dark", theme === "dark");

  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Keep the in-memory theme even when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const darkMode = theme === "dark";

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const nextTheme = (event as CustomEvent<Theme>).detail;
      if (nextTheme === "light" || nextTheme === "dark") {
        setTheme(nextTheme);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === "theme") {
        setTheme(event.newValue === "dark" ? "dark" : "light");
      }
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => applyTheme(darkMode ? "light" : "dark")}
    >
      {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
