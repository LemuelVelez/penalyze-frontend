import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

function getTheme() {
  return localStorage.getItem("theme") === "dark";
}

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(getTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setDarkMode((value) => !value)}
    >
      {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
