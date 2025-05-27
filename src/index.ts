import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import path from 'node:path';
import { tiktokApiRoutes } from './routes/tiktokapi'; // Import the new routes

const port = parseInt(process.env.PORT || '9001');
const publicPath = path.join(__dirname, '..', 'public');

const app = new Elysia()
  .use(staticPlugin({
    assets: publicPath,
    prefix: '/',
    noCache: true,
  }))
  .get('/', () => 'Hello from ElysiaJS / HTML served if public/index.html exists') // Base route
  .use(tiktokApiRoutes) // Use the TikTok API routes
  .onError(({ code, error, set }) => {
    console.error(`Error [${code}]: ${error.message}`);
    set.status = 500;
    return error.toString();
  })
  .listen(port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(`Serving static files from: ${publicPath}`);
console.log('Mounted TikTok API routes at /api');
