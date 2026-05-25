declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module '*.css'

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

declare interface Window {
  __INITIAL_STATE__: import('../shared/messages').ContextPanelState
}
