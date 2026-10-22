/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production API origin when UI is on Netlify (e.g. https://xxx.onrender.com). Empty = same origin / Vite proxy. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
