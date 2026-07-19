/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMS_CLIENT_ID: string;
  readonly VITE_IMS_ENVIRONMENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
