import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { cleanupStaleVersionCache } from "./lib/cache";
import "./styles.css";

// Remove localStorage entries from old app versions before anything reads the cache.
// Old-version entries don't count toward the internal budget but consume the real
// localStorage quota, eventually causing QuotaExceededError for new writes.
cleanupStaleVersionCache();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
