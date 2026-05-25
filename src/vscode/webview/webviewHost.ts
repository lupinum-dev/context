import type { ContextPanelState } from '../../shared/messages'

export function getWebviewHtml(params: {
  scriptUri: string
  styleUri: string
  cspSource: string
  nonce: string
  state: ContextPanelState
}): string {
  const initialState = JSON.stringify(params.state).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${params.cspSource} 'unsafe-inline'; script-src 'nonce-${params.nonce}' ${params.cspSource}; img-src ${params.cspSource} data:; font-src ${params.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lupinum Context</title>
  <link rel="stylesheet" href="${params.styleUri}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${params.nonce}">window.__INITIAL_STATE__ = ${initialState};</script>
  <script type="module" nonce="${params.nonce}" src="${params.scriptUri}"></script>
</body>
</html>`
}
