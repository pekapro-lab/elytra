// Build estático solo para GitHub Pages (workflow pages.yml). No afecta al build web (vite.config.ts).
// Base relativa: funciona en https://pekapro-lab.github.io/<repo>/ sin fijar el nombre.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL("./pages", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tailwindcss(), viteReact()],
  build: {
    target: ["es2020", "chrome87"],
    cssTarget: ["chrome87"],
    outDir: fileURLToPath(new URL("./dist-pages", import.meta.url)),
    emptyOutDir: true,
  },
});
