import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import postcss from 'postcss';
import { build } from 'esbuild';
import vm from 'node:vm';
const read = path => readFileSync(path, 'utf8');
function declaration(file, selector, property) {
  let result;
  postcss.parse(read(file)).walkRules(rule => {
    if (rule.selector === selector) rule.walkDecls(property, decl => { result = decl.value; });
  });
  return result;
}
assert.equal(declaration('src/styles/layout.css','.app-content','padding'),'var(--space-3) var(--space-2)');
assert.equal(declaration('src/styles/layout.css','.breadcrumb-current','font-size'),'var(--text-base)');
assert.equal(declaration('src/styles/common.css','.action-detail','background'),'transparent');
assert.equal(declaration('src/styles/common.css','.action-detail','border'),'0');
assert.equal(declaration('src/styles/components.css','.table-page-toolbar','min-height'),'48px');
assert.match(read('src/components/ui/FilterBar.jsx'),/showLabels = true/);
assert.match(read('src/components/ui/AppDrawer.jsx'),/maskClosable = true/);
assert.match(read('src/components/ui/AppDrawer.jsx'),/!loading && !confirming/);
const header=read('src/app/AppLayout.jsx').split('<Header')[1].split('</Header>')[0];
assert.ok(!/新增|上传|导出/.test(header),'全局顶栏不得放业务操作');
assert.match(header,/<NotificationCenter/);assert.match(header,/打开用户菜单/);
const entry=read('src/styles.css');
assert.ok(entry.indexOf('legacy.css') < entry.indexOf('layout.css'),'公共布局不得被遗留规则覆盖');
assert.ok(!/\.app-content\s*\{/.test(read('src/styles/legacy.css')),'布局只有一个样式入口');
assert.ok(!read('../web/login.html').includes('brand-slogan'),'登录不放标语');
assert.ok(!/<link[^>]+href=["']\/assets\//.test(read('../web/login.html')), '登录前不能依赖受登录保护的样式资源');
assert.ok(!read('../web/login.html').includes('{{LOGIN_STYLES}}'), '登录样式必须在构建时生成');
for (const path of ['../docs/设计规范.md','../docs/页面复测清单.md']) assert.ok(existsSync(path));
for (const file of ['customers/CustomerFormModal','users/UserFormModal','products/ProductDrawer','products/policies/SnowPolicyFormModal','product-policies/ProductPolicyPage']) {
  const source=read(`src/features/${file}.jsx`);
  assert.match(source,/useDraftState/);assert.match(source,/dirty=\{/);
}
// Open/reset baselines, editing and reverting must produce correct discard protection.
let values=[], cursor=0;
const context={window:{React:{useState:initial=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;}];}}}};
vm.createContext(context);
const bundle=await build({entryPoints:['src/hooks/useDraftState.js'],bundle:true,write:false,format:'iife',globalName:'Draft'});
vm.runInContext(bundle.outputFiles[0].text,context);
const render=()=>{cursor=0;return context.Draft.useDraftState({name:'',ids:[]});};
assert.equal(render()[3],false);
render()[2]({name:'已载入',ids:[1]});assert.equal(render()[3],false);
render()[1](previous=>({...previous,name:'修改'}));assert.equal(render()[3],true);
render()[1](previous=>({...previous,name:'已载入'}));assert.equal(render()[3],false);
render()[1](previous=>({...previous,ids:[1,2]}));assert.equal(render()[3],true);
render()[2]({name:'下一条',ids:[]});assert.equal(render()[3],false);
console.log('UI契约检查通过：紧凑布局、文字行操作、筛选标签、安全关闭、全站草稿基线、顶栏职责、规范入口');
