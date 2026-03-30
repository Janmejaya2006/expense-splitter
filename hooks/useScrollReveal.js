"use client";

import { useEffect } from "react";

export default function useScrollReveal(ref) {
  useEffect(() => {
    const node = ref?.current;
    if (!node) return undefined;

    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      node.classList.add("visible");
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [ref]);
}
