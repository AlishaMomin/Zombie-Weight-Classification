import React from "react";
import ZombieGame from "./ZombieGame";

const App: React.FC = () => {
  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      <ZombieGame />
    </div>
  );
};

export default App;

