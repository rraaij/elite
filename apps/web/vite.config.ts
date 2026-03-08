import { defineConfig } from "vite";

export default defineConfig({
	server: {
		// Fixed port keeps local scripts and E2E config stable.
		host: "127.0.0.1",
		port: 4173,
	},
	preview: {
		host: "127.0.0.1",
		port: 4173,
	},
	build: {
		target: "es2022",
		sourcemap: false,
		manifest: true,
		rollupOptions: {
			output: {
				entryFileNames: "assets/[name]-[hash].js",
				chunkFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash][extname]",
			},
		},
	},
});
