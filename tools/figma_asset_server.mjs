import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || process.cwd());
const port = Number(process.env.FIGMA_ASSET_PORT || 4192);
const mime = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
  const filePath = resolve(root, `.${pathname}`);
  const insideRoot = filePath === root || filePath.startsWith(`${root}${sep}`);

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-store");

  if (!insideRoot || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.setHeader("Content-Type", mime[extname(filePath).toLowerCase()] || "application/octet-stream");
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Figma asset server: http://127.0.0.1:${port}`);
});
