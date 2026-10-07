export const THEME_KEY = "osf-theme";
export const SIDEBAR_KEY = "osf-sidebar";

/**
 * Inline, runs before first paint: dark mode (login stays light) and the
 * collapsed sidebar, so neither flashes on load.
 */
export const THEME_SCRIPT = `try{var m=localStorage.getItem("${THEME_KEY}");var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d&&!location.pathname.startsWith("/login"))document.documentElement.classList.add("dark");if(localStorage.getItem("${SIDEBAR_KEY}")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
