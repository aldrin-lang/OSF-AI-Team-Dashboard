export const THEME_KEY = "osf-theme";

/** Inline, runs before first paint so there's no white flash in dark mode (login stays light). */
export const THEME_SCRIPT = `try{var m=localStorage.getItem("${THEME_KEY}");var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d&&!location.pathname.startsWith("/login"))document.documentElement.classList.add("dark")}catch(e){}`;
