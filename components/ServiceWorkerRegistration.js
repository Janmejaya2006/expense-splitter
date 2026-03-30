"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const shouldRegister =
      process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_PWA_DEV === "true";
    if (!shouldRegister) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures should not block app usage.
    });
  }, []);

  return null;
}
