import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useMatch } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import "./styles.css";
import { cssVariablesResolver, theme } from "./theme";

// PDF 用のページは、ダークモードの端末でも白い紙の配色で描く
function Theme({ children }: { children: React.ReactNode }) {
  const print = useMatch("/projects/:projectId/print") != null;
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
      forceColorScheme={print ? "light" : undefined}
    >
      {children}
    </MantineProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Theme>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Theme>
    </BrowserRouter>
  </StrictMode>,
);
