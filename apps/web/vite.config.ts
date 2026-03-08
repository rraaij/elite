import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Fixed port keeps local scripts and E2E config stable.
    host: "127.0.0.1",
    port: 4173,
  },
});
