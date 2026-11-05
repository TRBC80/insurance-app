// Copies PDF.js's worker into /public so the browser can load it from
// /pdf.worker.min.mjs. Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
mkdirSync("public", { recursive: true });
copyFileSync(join(pkgDir, "build", "pdf.worker.min.mjs"), join("public", "pdf.worker.min.mjs"));
console.log("Copied pdf.worker.min.mjs to public/");
