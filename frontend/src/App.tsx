import React, { useEffect, useMemo, useState } from "react";
import ZombieGame from "./ZombieGame";

const App: React.FC = () => {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = window.localStorage.getItem("zai-theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    window.localStorage.setItem("zai-theme", theme);
  }, [theme]);

  const surfaceStyle = useMemo<React.CSSProperties>(() => {
    if (theme === "light") {
      return {
        minHeight: "100vh",
        background: "#ffffff",
        color: "#111",
        transition: "background 180ms ease, color 180ms ease"
      };
    }
    return {
      minHeight: "100vh",
      background: "#121212",
      color: "#f3f3f3",
      transition: "background 180ms ease, color 180ms ease"
    };
  }, [theme]);

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={surfaceStyle}>
        <ZombieGame />
      </div>
      <button
        type="button"
        onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 9999,
          borderRadius: 999,
          border: "1px solid #555",
          background: theme === "dark" ? "#f8f8f8" : "#111",
          color: theme === "dark" ? "#111" : "#f8f8f8",
          fontWeight: 700,
          fontSize: 12,
          padding: "10px 14px",
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)"
        }}
        aria-label="Toggle light or dark mode"
      >
        {theme === "dark" ? "Light Mode ☀️" : "Dark Mode 🌙"}
      </button>
    </div>
  );
};

export default App;

