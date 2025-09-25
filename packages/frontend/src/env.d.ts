declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
    SSR_API_ORIGIN?: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOGIN?: string | boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
