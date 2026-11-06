import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { automaticWidths, visibleText } from '../src/components/ui/tableColumnSizing.js';
const measure = text => text.length * 13;
const columns = [{ key:'name', title:'名称', maxAutoWidth:300 }, { key:'amount', title:'金额', render:(_,r)=>`¥${r.amount.toFixed(2)}` }];
assert.equal(automaticWidths(columns,[{name:'长'.repeat(100),amount:12.3}],measure).name,300);
assert.equal(automaticWidths(columns,[],measure).name,80);
assert.ok(automaticWidths(columns,[{name:'短',amount:123456789}],measure).amount > automaticWidths(columns,[{name:'短',amount:1}],measure).amount);
assert.equal(visibleText({props:{content:'隐藏信息不参与测量',children:'可见文字'}}),'可见文字');
assert.equal(automaticWidths([{key:'e',title:'证据',minWidth:160,maxAutoWidth:400}], [{e:'短\n短'}],measure).e,160);
assert.equal(automaticWidths([{key:'a',title:'金额',widthText:()=> '实际显示'}],[{}],measure).a,100);
function scan(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?scan(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);
}
for (const file of scan('src').filter(file=>file.endsWith('.jsx'))) {
  const source = readFileSync(file,'utf8');
  assert.ok(!/<table\b/.test(source), `${file} 禁止新增独立原生表格，请使用DataTable`);
  if (file !== 'src/components/ui/DataTable.jsx') assert.ok(!/<Table\b/.test(source), `${file} 禁止绕过DataTable`);
}
console.log('表格规范检查通过：内容测量、自动上限、空表、金额、隐藏提示、多行证据、业务测量、全站入口统一');
// Migration contract: conditional cells stay aligned and action callbacks survive unchanged.
const { build } = await import('esbuild');
const vm = await import('node:vm');
const element = (type, props, ...children) => ({type,props:{...props,children:children.length===1?children[0]:children}});
const ctx = {window:{innerHeight:900,React:{ createElement:element, Children:{toArray:value=>(Array.isArray(value)?value.flat(Infinity):[value]).filter(v=>v!=null&&v!==false)},isValidElement:node=>Boolean(node?.type),useState:init=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},useMemo:fn=>fn()},arco:{Select:{},Typography:{}}}, document:{}};
vm.createContext(ctx);
const adapter = await build({entryPoints:['src/components/ui/AdaptiveTable.jsx'],bundle:true,write:false,format:'iife',globalName:'Adapter',jsxFactory:'React.createElement'});
vm.runInContext(adapter.outputFiles[0].text,ctx);
let clicked=false;
const action=element('button',{onClick:()=>{clicked=true;}},'导出');
const tree=ctx.Adapter.AdaptiveTable({children:[element('colgroup',{}),element('thead',{},element('tr',{},element('th',{},'名称'),false,element('th',{},'操作'))),element('tbody',{},[element('tr',{key:'one'},element('td',{},'客户甲'),false,element('td',{},action))])]});
assert.equal(tree.props.columns.length,2);
assert.equal(tree.props.data.length,1);
assert.equal(tree.props.columns[1].render(null,tree.props.data[0]),action);
tree.props.columns[1].render(null,tree.props.data[0]).props.onClick();
assert.equal(clicked,true);
console.log('弹窗表格迁移检查通过：条件列对齐、行保留、按钮及原回调保留');
