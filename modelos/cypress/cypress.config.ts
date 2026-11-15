// Modelo do modo-deus. Ajuste baseUrl e o comando que sobe o app.
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{ts,tsx,js}",
    supportFile: "cypress/support/e2e.ts",
    video: false,
    retries: { runMode: 1, openMode: 0 }, // uma nova tentativa só no CI: revela instável sem esconder
  },
  component: {
    devServer: { framework: "react", bundler: "vite" }, // ajuste ao projeto (next, vue, svelte...)
    specPattern: "**/*.cy.{ts,tsx}",
    supportFile: "cypress/support/component.ts",
  },
  defaultCommandTimeout: 8000,
});
