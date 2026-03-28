import React, { useEffect, useState } from "react";
import ZombieGame from "./ZombieGame";

const App: React.FC = () => {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = window.localStorage.getItem("zai-theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    window.localStorage.setItem("zai-theme", theme);
  }, [theme]);

  useEffect(() => {
    const bg = theme === "light" ? "#f0f0f0" : "#0a0a0a";
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
  }, [theme]);

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <ZombieGame theme={theme} />
      <button
        type="button"
        onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          bottom: "auto",
          zIndex: 10000,
          borderRadius: 999,
          border: theme === "dark" ? "1px solid #666" : "1px solid #bbb",
          background: theme === "dark" ? "#f0f0f0" : "#1a1a1a",
          color: theme === "dark" ? "#111" : "#f5f5f5",
          fontWeight: 700,
          fontSize: 12,
          padding: "10px 14px",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
        }}
        aria-label="Toggle light or dark mode"
      >
        {theme === "dark" ? "Light Mode ☀️" : "Dark Mode 🌙"}
      </button>
    </div>
  );
};

export default App;

