import { createLogger, createServer } from 'vite'

const logger = createLogger()
const error = logger.error.bind(logger)
logger.error = (message, options) => {
  if (String(message).includes('WebSocket server error:')) {
    return
  }
  error(message, options)
}

const server = await createServer({
  appType: 'custom',
  configFile: false,
  customLogger: logger,
  root: process.cwd(),
  server: {
    middlewareMode: true,
  },
  ssr: {
    noExternal: ['ignore'],
  },
})

try {
  const { runBenchmarkCli } = await server.ssrLoadModule('/src/bench/benchmarkHarness.ts')
  await runBenchmarkCli(process.argv.slice(2), process.cwd())
} finally {
  await server.close()
}
