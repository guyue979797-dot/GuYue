import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { readdirSync,readFileSync } from 'node:fs';
const element=(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}});
const Button=()=>{},Drawer=()=>{},Space=()=>{};
const ctx={document:{body:{}},window:{React:{createElement:element},arco:{Typography:{},Button,Drawer,Space}}};
vm.createContext(ctx);
const bundle=await build({entryPoints:['src/components/ui/FormDrawer.jsx'],bundle:true,write:false,format:'iife',globalName:'Module',jsxFactory:'React.createElement'});
vm.runInContext(bundle.outputFiles[0].text,ctx);
function nodes(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);return[node,...nodes(node.props?.children)];}
let saved=0,closed=0;
let form=ctx.Module.FormDrawer({visible:true,size:'small',loading:true,onSubmit:()=>saved++,onCancel:()=>closed++});
let buttons=nodes(form.props.footer).filter(node=>node.type===Button);
assert.ok(buttons.every(node=>node.props.disabled));buttons[0].props.onClick();buttons[1].props.onClick();
let drawer=form.type(form.props);drawer.props.onCancel();
assert.equal(saved,0);assert.equal(closed,0);assert.equal(drawer.props.closable,false);assert.equal(drawer.props.escToExit,false);
assert.equal(drawer.props.getChildrenPopupContainer(),ctx.document.body);
assert.equal(drawer.props.placement,'right');assert.equal(drawer.props.width,'min(520px, 100vw)');
form=ctx.Module.FormDrawer({visible:true,onOk:()=>saved++,onCancel:()=>closed++,okText:'确认导入'});
buttons=nodes(form.props.footer).filter(node=>node.type===Button);buttons[1].props.onClick();assert.equal(saved,1);
form=ctx.Module.FormDrawer({visible:true,onCancel:()=>closed++});
buttons=nodes(form.props.footer).filter(node=>node.type===Button);assert.equal(buttons.length,1);assert.equal(buttons[0].props.children,'关闭');buttons[0].props.onClick();assert.equal(closed,1);
assert.equal(ctx.Module.FormDrawer({footer:null}).props.footer,null);
assert.equal(ctx.Module.FormDrawer({okButtonProps:{loading:true}}).props.loading,true);
function scan(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
for(const file of scan('src').filter(file=>file.endsWith('.jsx'))){
 const source=readFileSync(file,'utf8');
 assert.ok(!/Modal\.info\s*\(/.test(source),`${file}: 详情必须使用声明式抽屉`);
 assert.ok(!/ui\/FormModal\.jsx/.test(source),`${file}: 表单必须使用FormDrawer`);
 if(file!=='src/components/ui/AppDrawer.jsx')assert.ok(!/<Drawer\b/.test(source),`${file}: 不得绕过AppDrawer`);
 if(/<Modal\b/.test(source)){
  assert.equal(file,'src/features/photos/PhotoLibraryPage.jsx','只有删除标签确认保留声明式Modal');
  assert.equal((source.match(/<Modal\b/g)||[]).length,1);
  assert.match(source, /<Modal\s+title="删除标签"/);
 }
}
console.log('全站抽屉规范检查通过：右侧/视口宽度、保存锁定、确认导入兼容、只读关闭、自定义底栏、入口约束');
for (const [file, fieldClass] of [
 ['src/features/customers/CustomerFormModal.jsx','customer-form-grid'],
 ['src/features/users/UserFormModal.jsx','user-form-grid'],
 ['src/features/products/policies/SnowPolicyFormModal.jsx','policy-form-grid'],
 ['src/features/products/policies/SnowPolicyFormModal.jsx','policy-gift-condition-group'],
 ['src/features/product-policies/ProductPolicyPage.jsx','product-form-grid'],
]) {
 const source=readFileSync(file,'utf8');
 assert.ok(new RegExp(`className="[^"]*${fieldClass}[^"\\n]*drawer-field-stack`).test(source),`${file}: 独立字段必须使用单列容器`);
}
const styles=readFileSync('src/styles/components.css','utf8');
assert.match(styles,/\.app-drawer \.arco-drawer-inner > \[data-focus-lock-disabled\]\s*\{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/,'焦点锁定包装层必须传递抽屉高度');
assert.match(styles,/\.app-drawer \.arco-drawer-footer\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*z-index:\s*2;[^}]*background:/,'底栏必须置底并覆盖正文');
assert.match(styles,/\.app-drawer\.form-drawer \.drawer-field-stack\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
console.log('新增抽屉布局检查通过：客户、权限、政策及价格与用量均使用单列字段容器');
