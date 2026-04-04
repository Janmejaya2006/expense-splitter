import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", ".tmp/**", "public/ui/assets/**", "test-results/**", "playwright-report/**"],
  },
  ...nextVitals,
];

export default config;
