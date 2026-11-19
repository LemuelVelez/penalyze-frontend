// Apply the saved theme before React mounts, without an inline script (CSP safe).
try {
  const theme = localStorage.getItem("theme");
  const legacy = localStorage.getItem("darkMode");
  const dark = theme !== "light" && (Boolean(theme) || legacy !== "false");
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
} catch {
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
