import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
          "vendor-xlsx": ["xlsx-js-style"],
          "vendor-ui": ["lucide-react", "framer-motion"],
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
          "vendor-date": ["date-fns"],
          "vendor-markdown": ["react-markdown", "rehype-sanitize", "dompurify"],
          "vendor-shadcn": ["clsx", "tailwind-merge", "class-variance-authority"],
        },
      },
    },
  },
});
