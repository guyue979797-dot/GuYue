/**
 * 架构约束检查脚本（WP-01）。
 * 目标：在 CI 中尽早发现违反《前端代码重构要求》的提交。
 */
import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const failures = [];
const warnings = [];

function countLines(file) {
  return readFileSync(file, "utf-8").split("\n").length;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".vite") continue;
      walk(full, files);
    } else if (/\.(jsx?|css)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const appFile = join(root, "app", "App.jsx");
if (existsSync(appFile)) {
  const lines = countLines(appFile);
  if (lines > 300) {
    failures.push(`app/App.jsx 行数 ${lines} > 300（重构要求第 13 节 DoD）`);
  } else {
    warnings.push(`app/App.jsx 行数 ${lines}，符合 ≤300 目标`);
  }
}

for (const file of walk(root)) {
  const source = readFileSync(file, "utf-8");
  const rel = file.replace(root + "/", "");
  if (file.endsWith(".css")) {
    for (const match of source.matchAll(/^(\s*)(table|td|th|button|input|select|textarea)([ ,{])/gm)) {
      failures.push(`${rel}: 全局选择器 "${match[0].trim()}"（原则七）`);
    }
    for (const match of source.matchAll(/:nth-child\(/g)) {
      failures.push(`${rel}: 使用 nth-child() 表达列语义（原则七/重构要求 6.2）`);
    }
    for (const match of source.matchAll(/!important/g)) {
      const before = source.slice(Math.max(0, match.index - 200), match.index);
      if (!/\/\*/.test(before.slice(before.lastIndexOf("\n")))) {
        failures.push(`${rel}: 无注释 !important（重构要求 6.2）`);
      }
    }
  }
  if (file.endsWith(".jsx")) {
    if (/window\.arco|window\.React/.test(source)) {
      warnings.push(`${rel}: 直接访问 window.arco/window.React，应改用 lib/ 桥接模块`);
    }
    if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(source)) {
      failures.push(`${rel}: 存在不安全的 HTML 注入`);
    }
  }
}

console.log("== 架构检查结果 ==");
for (const item of warnings) console.log(`[warn] ${item}`);
for (const item of failures) console.log(`[fail] ${item}`);
if (failures.length) {
  console.error(`\n架构检查未通过：${failures.length} 个问题`);
  process.exit(1);
}
console.log(`\n架构检查通过（${warnings.length} 条提示）。`);
