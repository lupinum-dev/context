import { defineConfig } from 'vite-plus'

export default defineConfig({
  build: {
    target: 'node20',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    ssr: 'src/extension.ts',
    rollupOptions: {
      external: ['vscode'],
      output: {
        entryFileNames: 'extension.js',
        exports: 'named',
        format: 'cjs',
      },
    },
  },
  ssr: {
    noExternal: ['ignore'],
  },
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
  },
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    singleQuote: true,
    semi: false,
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn'],
    categories: {
      correctness: 'warn',
    },
    env: {
      builtin: true,
      es2022: true,
      node: true,
    },
    rules: {
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
})
