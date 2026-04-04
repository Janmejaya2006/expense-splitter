"use client";

import { useEffect } from "react";

const UI_STYLESHEET_ID = "runtime-ui-stylesheet";
const UI_STYLESHEET_HREF = "/ui/assets/index-BfsPmzMs.css";
const UI_APP_SCRIPT_ID = "runtime-ui-app-script";
const UI_APP_SCRIPT_SRC = "/ui/assets/index-CdDdhE-i.js";
const UI_RUNTIME_SCRIPT_ID = "runtime-auth-script";
const UI_RUNTIME_SCRIPT_SRC = "/ui/runtime-auth.js?v=20260403g";

function removeScriptById(id) {
  const node = document.getElementById(id);
  if (node && node.parentNode) {
    node.parentNode.removeChild(node);
  }
}

function normalizePath(value) {
  const input = String(value || "").trim();
  if (!input) return "/";
  if (input.length > 1 && input.endsWith("/")) return input.slice(0, -1);
  return input;
}

export default function UiRuntimeHost({ virtualPath = "", bootstrapPath = "" }) {
  useEffect(() => {
    const normalizedVirtualPath = normalizePath(virtualPath);
    const normalizedBootstrapPath = normalizePath(bootstrapPath);
    const currentPath = normalizePath(window.location.pathname);
    const shouldVirtualBootstrap =
      normalizedVirtualPath &&
      normalizedBootstrapPath &&
      normalizedVirtualPath !== normalizedBootstrapPath &&
      currentPath === normalizedVirtualPath;

    if (shouldVirtualBootstrap) {
      window.__EXPENSE_SPLIT_VIRTUAL_PATH = normalizedVirtualPath;
      window.__EXPENSE_SPLIT_BOOTSTRAP_PATH = normalizedBootstrapPath;
      if (currentPath !== normalizedBootstrapPath) {
        window.history.replaceState(
          window.history.state,
          "",
          `${normalizedBootstrapPath}${window.location.search}${window.location.hash}`
        );
      }
    } else {
      window.__EXPENSE_SPLIT_VIRTUAL_PATH = "";
      window.__EXPENSE_SPLIT_BOOTSTRAP_PATH = "";
    }

    if (!document.getElementById(UI_STYLESHEET_ID)) {
      const stylesheet = document.createElement("link");
      stylesheet.id = UI_STYLESHEET_ID;
      stylesheet.rel = "stylesheet";
      stylesheet.href = UI_STYLESHEET_HREF;
      document.head.appendChild(stylesheet);
    }

    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = "";
    }

    removeScriptById(UI_APP_SCRIPT_ID);
    removeScriptById(UI_RUNTIME_SCRIPT_ID);

    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const appScript = document.createElement("script");
    appScript.id = UI_APP_SCRIPT_ID;
    appScript.type = "module";
    appScript.src = `${UI_APP_SCRIPT_SRC}?v=${nonce}`;
    document.body.appendChild(appScript);

    const runtimeScript = document.createElement("script");
    runtimeScript.id = UI_RUNTIME_SCRIPT_ID;
    runtimeScript.defer = true;
    runtimeScript.src = `${UI_RUNTIME_SCRIPT_SRC}&v=${nonce}`;
    document.body.appendChild(runtimeScript);

    if (shouldVirtualBootstrap) {
      window.setTimeout(() => {
        if (normalizePath(window.location.pathname) === normalizedBootstrapPath) {
          window.history.replaceState(
            window.history.state,
            "",
            `${normalizedVirtualPath}${window.location.search}${window.location.hash}`
          );
        }
      }, 120);
    }
  }, [virtualPath, bootstrapPath]);

  return <div id="root" suppressHydrationWarning />;
}
