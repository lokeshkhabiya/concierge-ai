import { render } from "ink";
import React from "react";
import { App } from "./src/App";
import { clearSession } from "./src/utils";

// In CLI dev mode, always start with a fresh session
if (process.env.CLI_ALWAYS_NEW_SESSION === "true") {
  clearSession();
}

// Render the application
render(<App />);
