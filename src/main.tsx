import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker (public/sw.js) is OFF by default. Set VITE_ENABLE_SW=true on Vercel to turn it on.
// While it is off, any copy already on a visitor's device is removed on their next visit.
if ("serviceWorker" in navigator && import.meta.env.PROD && window.self === window.top) {
  window.addEventListener("load", () => {
    if (import.meta.env.VITE_ENABLE_SW === "true") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    } else {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .then(() => ("caches" in window ? caches.keys().then(keys => Promise.all(keys.filter(k => /^(shell|assets|images)-/.test(k)).map(k => caches.delete(k)))) : undefined))
        .catch(() => undefined);
    }
  });
}
