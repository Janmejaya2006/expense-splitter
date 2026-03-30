import { useCallback } from "react";

export default function useApiRequest() {
  return useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Session expired. Please login again.");
    }

    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }

    return body;
  }, []);
}
