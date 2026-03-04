import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version?: string;
};

const PREVIEW_PATH = "/previews/fleet-grouping.html";

function rewriteRootUrlToPreview(url: string): string {
  const [pathname, query] = url.split("?", 2);
  if (pathname !== "/" && pathname !== "/index.html") {
    return url;
  }
  return query ? `${PREVIEW_PATH}?${query}` : PREVIEW_PATH;
}

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(pkg.version ?? "0.0.0")
  },
  server: {
    port: 5173
  },
  plugins: [
    {
      name: "fleet-grouping-preview-root-rewrite",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (!req.url) {
            next();
            return;
          }
          req.url = rewriteRootUrlToPreview(req.url);
          next();
        });
      }
    }
  ]
});
