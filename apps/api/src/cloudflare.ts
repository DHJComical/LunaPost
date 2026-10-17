import { createApp, type AppEnv } from './app.js'

const app = createApp()
type Env = AppEnv['Bindings'] & { ASSETS: Fetcher }

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Never silently run a production instance with ephemeral accounts or the development JWT secret.
    if (!env?.DB || !env.JWT_SECRET) return Response.json({ error: { code: 'DEPLOYMENT_INCOMPLETE', message: 'Configure DB and JWT_SECRET before using the API' } }, { status: 503 })
    const path = new URL(request.url).pathname
    if (path.startsWith('/api/') || path.startsWith('/v2/')) return app.fetch(request, env, ctx)
    return env.ASSETS.fetch(request)
  },
}
