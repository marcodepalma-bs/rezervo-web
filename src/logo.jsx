// src/Logo.jsx
export default function Logo({ theme = "dark", height = 22, alt = "Rezervo" }) {
  // Use bright logo on dark theme; dark logo on light theme
  const src = theme === "light" ? "/logo-dark.png" : "/logo-light.png";
  return (
    <img
      src={src}
      alt={alt}
      height={height}
      style={{ display: "block" }}
      onError={(e) => { e.currentTarget.replaceWith(document.createTextNode("Rezervo")); }}
    />
  );
}

