import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./visual-refresh.css";
import "./atoll-mechanics.css";
import "./window-polish.css";
import "./audio-hud.css";
import "./motion-v2.css";
import "./liquid-glass.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
