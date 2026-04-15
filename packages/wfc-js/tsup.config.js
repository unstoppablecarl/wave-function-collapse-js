import { defineConfig } from 'tsup'

const defaultConfig = {
  sourcemap: true,
  clean: true,
  format: [
    'cjs',
    'esm',
  ],
  loader: {
    '.wasm': 'file',
  },
  tsconfig: 'tsconfig.json',
}

const DEV = {
  ...defaultConfig,
  entry: {
    'index.dev': 'src/index.ts',
  },
  define: {
    __DEV__: 'true',
  },
}

const PROD = {
  ...defaultConfig,
  entry: {
    'index.prod': 'src/index.ts',
  },
  define: {
    __DEV__: 'false',
  },
}

export default defineConfig([
  {
    ...DEV,
    format: 'esm',
  },
  {
    ...DEV,
    format: 'cjs',
  },
  {
    ...PROD,
    format: 'esm',
    // dts: {
    //   // Force tsup to resolve the project structure correctly
    //   resolve: true,
    //   entry: 'src/index.ts'
    // },

    // The DTS build is the one that triggers the TS6307 error
    // if it can't find the file in the project's 'include' list.
    // dts: true,
  },
  {
    ...PROD,
    format: 'cjs',
  },
])