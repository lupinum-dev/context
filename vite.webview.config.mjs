import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    outDir: 'dist/webview',
    sourcemap: false,
    minify: false,
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/webview/main.ts',
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.some((name) => name.endsWith('.css'))) {
            return 'main.css'
          }
          return '[name][extname]'
        },
        format: 'es',
      },
    },
  },
})
