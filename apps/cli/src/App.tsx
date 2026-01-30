import React from "react";
import { Box, Text } from "ink";
import { AppProvider } from "./state";
import { ChatInterface } from "./components";

/**
 * Root application component
 */
export function App() {
  return (
    <AppProvider>
      <ChatInterface />
    </AppProvider>
  );
}
