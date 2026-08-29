import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

/**
 * Dev-only CORS pass-through.
 *
 * NVIDIA's integrate API sends no Access-Control-Allow-Origin header at all, so
 * a browser can never call it directly. This middleware relays `/api-proxy/nvidia/*`
 * upstream during local development; in production the same path is rewritten by
 * the redirect rule in netlify.toml. Nothing is stored or logged — the student's
 * key is only forwarded, exactly as the browser sent it.
 */
function nvidiaCorsProxy(): Plugin {
  const PREFIX = "/api-proxy/nvidia";
  return {
    name: "iale:nvidia-cors-proxy",
    // `pre` + configureServer's early hook so the SSR handler never sees these URLs.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(PREFIX)) return next();
        const upstream = "https://integrate.api.nvidia.com" + (url.slice(PREFIX.length) || "/");
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers))
            if (typeof v === "string" && !/^(host|origin|referer|connection)$/i.test(k))
              headers[k] = v;
          fetch(upstream, {
            method: req.method ?? "GET",
            headers,
            ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
          })
            .then(async (r) => {
              res.statusCode = r.status;
              res.setHeader("content-type", r.headers.get("content-type") ?? "application/json");
              res.setHeader("access-control-allow-origin", "*");
              res.end(Buffer.from(await r.arrayBuffer()));
            })
            .catch((e: Error) => {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: e.message }));
            });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss(), nvidiaCorsProxy()],
  resolve: {
    tsconfigPaths: true,
  },
});
