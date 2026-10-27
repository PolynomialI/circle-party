import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { Rooms } from './rooms.js';

export function createGameServer(opts) {
  const app = express();
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  app.use(express.static(publicDir));
  app.get('/healthz', (req, res) => res.send('ok'));

  const httpServer = createServer(app);
  // The page may be served by the static site, so allow other origins. Messages are small.
  const io = new Server(httpServer, { pingInterval: 10000, pingTimeout: 8000, cors: { origin: '*' }, maxHttpBufferSize: 16 * 1024 });
  const rooms = new Rooms(io, opts);
  rooms.start();
  return { httpServer, io, rooms };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { httpServer } = createGameServer();
  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, () => console.log(`Circle Party listening on http://localhost:${port}`));
}
