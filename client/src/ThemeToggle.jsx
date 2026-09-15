import { IconSun, IconMoon } from "./icons.jsx";

const KEY = "recapapp.theme";
const META = "theme-color";

function current() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  const meta = document.querySelector(`meta[name="${META}"]`);
  if (meta) meta.setAttribute("content", theme === "dark" ? "#191919" : "#fbfbfa");
}

export default function ThemeToggle() {
  const dark = current() === "dark";
  return (
    <button
      type="button"
      className="ghost sm theme-toggle"
      onClick={() => apply(dark ? "light" : "dark")}
      aria-label={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={dark ? "Mode terang" : "Mode gelap"}
    >
      {dark ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
      <span className="sr-only">Ganti tema</span>
    </button>
  );
}
