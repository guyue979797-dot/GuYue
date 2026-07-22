import { build } from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(root, "../web/assets");
const outFile = resolve(outDir, "index-arco.js");
const reactGlobalsFile = resolve(outDir, "react-globals.js");
const htmlFile = resolve(root, "../web/index.html");

await mkdir(outDir, { recursive: true });

await copyFile(
  resolve(root, "node_modules/@arco-design/web-react/dist/arco.min.js"),
  resolve(outDir, "arco.min.js"),
);
await copyFile(
  resolve(root, "node_modules/@arco-design/web-react/dist/css/arco.min.css"),
  resolve(outDir, "arco.min.css"),
);

await build({
  entryPoints: [resolve(root, "src/react-globals.js")],
  outfile: reactGlobalsFile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome107", "safari16", "firefox104", "edge107"],
  minify: true,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

await build({
  entryPoints: [resolve(root, "src/main.jsx")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome107", "safari16", "firefox104", "edge107"],
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  minify: true,
  legalComments: "none",
});

await writeFile(
  htmlFile,
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>雪花CRM拜访照片提取</title>
    <link rel="stylesheet" href="/assets/arco.min.css" />
    <link rel="stylesheet" href="/assets/index-arco.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="/assets/react-globals.js"></script>
    <script src="/assets/arco.min.js"></script>
    <script type="module" crossorigin src="/assets/index-arco.js"></script>
  </body>
</html>
`,
  "utf-8",
);
