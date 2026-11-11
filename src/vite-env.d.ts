/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ORDS_BASE_URL?: string
  readonly VITE_REGISTRATION_ORDS_BASE_URL?: string
  readonly VITE_TECHNICAL_REGISTRATION_ORDS_BASE_URL?: string
  readonly VITE_REGISTRATION_GRADES_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
