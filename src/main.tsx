import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker (see public/sw.js): repeat visits load faster and the shop shows an offline page instead of a
// browser error. Only in production builds and never inside an embedded preview frame.
// Set VITE_DISABLE_SW=true to switch it off and remove it from visitors' devices on their next visit.
if ("serviceWorker" in navigator && import.meta.env.PROD && window.self === window.top) {
  window.addEventListener("load", () => {
    if (import.meta.env.VITE_DISABLE_SW === "true") {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .then(() => ("caches" in window ? caches.keys().then(keys => Promise.all(keys.filter(k => /^(shell|assets|images)-/.test(k)).map(k => caches.delete(k)))) : undefined))
        .catch(() => undefined);
    } else {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  });
}
