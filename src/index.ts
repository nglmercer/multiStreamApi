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
    let errorMessage = 'An unknown error occurred';
    if (error && typeof (error as any).message === 'string') {
      errorMessage = (error as any).message;
    } else {
      errorMessage = error.toString();
    }
    console.error(`Error [${code}]: ${errorMessage}`);
    
    // Ensure a status is set. If the error object has a status, use it.
    // Otherwise, default to 500.
    if (error && typeof (error as any).status === 'number') {
      set.status = (error as any).status;
    } else {
      set.status = 500; // Default internal server error
    }
    
    return { error: errorMessage }; // It's good practice to return a JSON error response
  })
  .listen(port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(`Serving static files from: ${publicPath}`);
console.log('Mounted TikTok API routes at /api');
