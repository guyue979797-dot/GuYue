import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const ownerStyle = 'src/styles/focus.css';
const failures = [];
const focus = readFileSync(ownerStyle, 'utf8');
const entry = readFileSync('src/styles.css', 'utf8');
assert.ok(entry.trimEnd().endsWith('@import "./styles/focus.css";'), '焦点样式必须在业务样式后统一加载');
for (const name of ['arco-input', 'arco-textarea', 'arco-select', 'arco-picker', 'arco-input-tag', 'arco-input-number', 'data-focus-owner']) {
  assert.ok(focus.includes(name), `未覆盖控件焦点层：${name}`);
}
const rules = [];
postcss.parse(focus).walkRules(rule => rules.push(rule));
const value = (rule, property) => rule.nodes.find(node => node.prop === property)?.value;
assert.ok(rules.some(rule => rule.selector.includes('.arco-select') && rule.selector.includes(':focus-visible')
  && value(rule, 'outline') === 'none'), '管理控件必须移除内部重复outline');
assert.ok(rules.some(rule => rule.selector.includes('[data-focus-owner] :is(') && value(rule, 'border') === '0'),
  '组合输入的内部编辑器不得有第二层边框');
assert.ok(rules.some(rule => rule.selector.includes('button') && value(rule, 'outline')?.startsWith('2px solid')),
  '必须保留原生按钮和未知原生控件的键盘焦点');
for (const file of files('src').filter(file => file.endsWith('.css'))) {
  postcss.parse(readFileSync(file, 'utf8')).walkRules(rule => {
    if (rule.selector.includes('.arco-input-wrapper')) failures.push(`${file}: 禁止使用过期的Arco输入框选择器`);
    if (file === ownerStyle) return;
    const inputControl = /\b(input|textarea|picker|select|focus-owner)\b/.test(rule.selector);
    const focused = /:focus|\.arco-[\w-]*focus/.test(rule.selector);
    if (inputControl && focused) {
      rule.walkDecls(declaration => {
        if (/^(outline(?:-.*)?|box-shadow|border(?:-.*)?)$/.test(declaration.prop)) {
          failures.push(`${file}: ${rule.selector} 的焦点外框只能在focus.css或Arco自身定义`);
        }
      });
    }
  });
}
assert.equal(failures.length, 0, failures.join('\n'));
for (const file of files('src').filter(file => file.endsWith('.jsx'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<(?:textarea|input)\b[^>]*>/g)) {
    if (/type="(?:file|hidden|checkbox|radio)"/.test(match[0])) continue;
    assert.ok(match[0].includes('data-focus-owner'), `${file}: 原生文本输入必须声明data-focus-owner`);
  }
}
assert.match(readFileSync('src/features/products/ProductDrawer.jsx', 'utf8'), /className="product-multi-input" data-focus-owner/,
  '商品多编码输入由外层负责焦点边框');
const login = readFileSync('../web/login.html', 'utf8');
assert.ok(!/input:focus\s*\{[^}]*box-shadow/.test(login), '独立登录表单不能叠加第二层焦点阴影');
console.log('全站输入焦点检查通过：单一外框、内层编辑器、原生控件声明、过期选择器及登录页');
