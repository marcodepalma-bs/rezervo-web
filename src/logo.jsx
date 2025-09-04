// src/Logo.jsx
import LogoLight from "../logo-light.png"; // red logo for light theme (file is at repo root)
import LogoDark from "../logo-dark.png";   // white/bright logo for dark theme (file is at repo root)

export default function Logo({ theme = "dark", height = 22, alt = "Rezervo" }) {
  const src = theme === "light" ? LogoDark : LogoLight;
  return <img src={src} alt={alt} height={height} style={{ display: "block" }} />;
}
