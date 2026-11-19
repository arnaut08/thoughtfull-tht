import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import App from "./App.jsx";
import { theme } from "./theme.js";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/open-sans";
import "./styles/tokens.css";
import "./styles/base.css";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
