import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Resets scroll position on route change so every navigation starts at the top.
// Back/forward navigations keep the browser's restored position.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, navigationType]);

  return null;
}
