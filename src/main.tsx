import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initLogging } from "./lib/logging";

// Initialize the logging system
initLogging().catch(err => {
  console.error("Failed to initialize logging:", err);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="dark">
      <App />
    </div>
  </React.StrictMode>,
);
