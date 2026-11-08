import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { automaticWidths, fillColumnWidths, visibleText } from '../src/components/ui/tableColumnSizing.js';
const measure = text => text.length * 13;
const columns = [{ key:'name', title:'名称', maxAutoWidth:300 }, { key:'amount', title:'金额', render:(_,r)=>`¥${r.amount.toFixed(2)}` }];
assert.equal(automaticWidths(columns,[{name:'长'.repeat(100),amount:12.3}],measure).name,300);
assert.equal(automaticWidths(columns,[],measure).name,80);
// Short body values must not remove the header space needed by a native sorter.
assert.equal(automaticWidths([{key:"person",title:"经办人",sorter:true}], [{person:"张三"}], measure).person, measure("经办人") + 68);
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
// Short tables fill exactly; wide tables and manual widths remain authoritative.
assert.deepEqual(fillColumnWidths({a:100,b:200},600),{a:200,b:400});
assert.deepEqual(fillColumnWidths({a:100,b:200},250),{a:100,b:200});
assert.deepEqual(fillColumnWidths({a:100,b:200},600,{a:100}),{a:100,b:500});
assert.deepEqual(fillColumnWidths({a:100,b:200},600,{a:100,b:200}),{a:200,b:400});
assert.deepEqual(fillColumnWidths({},600),{});
assert.equal(Object.values(fillColumnWidths({a:80,b:80,c:80},1001)).reduce((sum,w)=>sum+w,0),1001);
assert.equal(Object.values(fillColumnWidths({a:80,b:80},500-40)).reduce((sum,w)=>sum+w,0)+40,500);
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

// Reproduce a tall body running below the viewport into pagination. Header
// growth and viewport resize must change the body cap; natural-height drilldowns
// must retain their requested cap rather than shrinking to their current rows.
let measured, effect, resize, disconnected = false;
let viewportBottom = 600, bodyTop = 140;
const header = {};
const viewport = { getBoundingClientRect:()=>({top:100,bottom:viewportBottom}),
  querySelector:selector=>selector==='.arco-table-body'?{getBoundingClientRect:()=>({top:bodyTop})}:header };
const ref = {current:viewport};
const heights = { window:{React:{useRef:()=>ref,useState:()=>[measured,value=>{measured=value;}],useEffect:fn=>{effect=fn;}},
  addEventListener(){},removeEventListener(){}},
  ResizeObserver:class {constructor(callback){resize=callback;}observe(){}disconnect(){disconnected=true;}} };
vm.createContext(heights);
const heightBundle=await build({entryPoints:['src/components/ui/useTableBodyHeight.js'],bundle:true,write:false,format:'iife',globalName:'Height'});
vm.runInContext(heightBundle.outputFiles[0].text,heights);
heights.Height.useTableBodyHeight(600,true);
const cleanup=effect();
assert.equal(heights.Height.useTableBodyHeight(600,true)[1],459);
viewportBottom=400;bodyTop=160;resize();
assert.equal(heights.Height.useTableBodyHeight(600,true)[1],239);
assert.equal(heights.Height.useTableBodyHeight(320,false)[1],320);
assert.equal(heights.Height.useTableBodyHeight(undefined,true)[1],undefined);
cleanup();assert.equal(disconnected,true);
console.log('表格高度回归通过：表头占位、缩放收缩、分页边界及自适应钻取表格');
