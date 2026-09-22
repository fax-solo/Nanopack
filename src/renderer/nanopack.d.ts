import type { NanoPackApi } from '../preload'

declare global {
  interface Window {
    nanopack: NanoPackApi
  }
}

export {}