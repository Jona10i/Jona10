import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";
import crypto from "crypto";

const DEFAULT_PORT = 3000;

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_PORT;
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT "${value}": expected an integer between 1 and 65535.`
    );
  }
  return port;
}

async function startServer() {
  const app = express();
  // Honor X-Forwarded-* when behind a proxy/tunnel (ngrok, cloudflared, platform gateway).
  app.set('trust proxy', 1);
  const PORT = parsePort(process.env.PORT);
  const server = http.createServer(app);

  // Cache policy (applies in both dev and production):
  // - /sw.js must NEVER be served from cache: browsers re-fetch it during
  //   service-worker update checks, and a stale cached copy can keep a
  //   broken worker alive indefinitely (this bit us in production).
  // - HTML is revalidated on every load so new deploys are picked up.
  // - /assets/* files are content-hashed by Vite, so they can be cached
  //   immutably forever.
  app.use((req, res, next) => {
    if (req.path === "/sw.js") {
      res.setHeader("Cache-Control", "no-store, must-revalidate");
    } else if (req.path === "/" || req.path.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    } else if (req.path.startsWith("/assets/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    next();
  });

  // Plain-HTTP half of the connectivity probe (see the 'upgrade' handler below):
  // lets the client distinguish "origin reachable but proxy strips WebSocket
  // upgrades" from "origin unreachable".
  app.get("/_ws_test_connection", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  // API endpoint to return client IP
  app.get("/api/info", (req, res) => {
    // In many cloud environments, the client IP is in x-forwarded-for
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.json({ 
      ip: typeof ip === 'string' ? ip.split(',')[0] : ip,
      timestamp: Date.now()
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // SPA fallback — always revalidate so deploys take effect immediately.
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Connectivity probe used by the client's NetworkCheck (src/App.tsx): it opens
  // a WebSocket to /_ws_test_connection to verify real-time connections survive
  // the proxy. Complete the handshake, then close immediately. Any other upgrade
  // (e.g. Vite HMR in dev) is left untouched for its own listener to handle.
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/_ws_test_connection') {
      const key = request.headers['sec-websocket-key'];
      if (!key) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const acceptKey = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
        
      const response = [
        'HTTP/1.1 101 Web Socket Protocol Handshake',
        'Upgrade: WebSocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        ''
      ].join('\r\n') + '\r\n';
      socket.write(response);
      // Complete politely with a WebSocket close frame (0x88 = FIN|Close opcode,
      // 0x00 = empty payload) instead of an abrupt TCP FIN -- some proxies flag
      // instantly-closed upgrades as failed handshakes.
      socket.end(Buffer.from([0x88, 0x00]));
      return;
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
