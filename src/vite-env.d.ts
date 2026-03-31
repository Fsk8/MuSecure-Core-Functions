/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACOUSTID_CLIENT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
