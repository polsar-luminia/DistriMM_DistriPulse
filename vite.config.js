import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { visualizer } from "rollup-plugin-visualizer";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    process.env.ANALYZE &&
      visualizer({ open: true, filename: "dist/stats.html", gzipSize: true }),
  ].filter(Boolean),
  server: {
    https: true,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts": ["recharts"],
          "vendor-ui": ["lucide-react", "framer-motion"],
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
          "vendor-date": ["date-fns"],
          "vendor-markdown": ["react-markdown", "rehype-sanitize", "dompurify"],
          "vendor-shadcn": [
            "clsx",
            "tailwind-merge",
            "class-variance-authority",
          ],
          "vendor-sentry": ["@sentry/react"],
        },
      },
    },
  },
});
