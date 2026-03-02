/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly glob: any;
}

declare module '*.scss' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}