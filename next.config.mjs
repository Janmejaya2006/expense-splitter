import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/login",
          destination: "/ui/index.html",
        },
        {
          source: "/signup",
          destination: "/ui/index.html",
        },
        {
          source: "/register",
          destination: "/ui/index.html",
        },
        {
          source: "/create-group",
          destination: "/ui/index.html",
        },
        {
          source: "/create-expense",
          destination: "/ui/index.html",
        },
        {
          source: "/group/:path*",
          destination: "/ui/index.html",
        },
        {
          source: "/settle",
          destination: "/ui/index.html",
        },
        {
          source: "/profile",
          destination: "/ui/index.html",
        },
        {
          source: "/features",
          destination: "/ui/index.html",
        },
        {
          source: "/how-it-works",
          destination: "/ui/index.html",
        },
        {
          source: "/pricing",
          destination: "/ui/index.html",
        },
        {
          source: "/about",
          destination: "/ui/index.html",
        },
        {
          source: "/contact",
          destination: "/ui/index.html",
        },
      ],
      afterFiles: [
        {
          source: "/verify",
          destination: "/ui/index.html",
        },
        {
          source: "/welcome",
          destination: "/ui/index.html",
        },
        {
          source: "/ui",
          destination: "/ui/index.html",
        },
        {
          source: "/ui/:path*",
          destination: "/ui/index.html",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
