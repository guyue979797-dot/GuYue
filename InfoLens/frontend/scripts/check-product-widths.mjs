import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { policyCostText, productWidthText } from '../src/features/products/productWidthText.js';
assert.equal(policyCostText({price:0,remaining_quantity:74.5}), '¥0.00（75）');
assert.equal(productWidthText({policy_costs:[]},'policy_costs'), '-');
assert.equal(productWidthText({policy_costs:[{price:80.25,remaining_quantity:74.5},{price:90,remaining_quantity:100}]},'policy_costs'), '¥80.25（75）\n¥90.00（100）');
let manual = {}, drag = { current: null };
const context = { window: { React: {
  useState: () => [manual, value => { manual = value(manual); }],
  useMemo: fn => fn(), useRef: () => drag,
}}, document: { createElement: () => ({getContext: () => ({ measureText: text => ({width: text.length * 7}) })}) }};
vm.createContext(context);
const bundle = await build({entryPoints:['src/components/ui/useTableColumnWidths.js'],bundle:true,write:false,format:'iife',globalName:'Widths'});
vm.runInContext(bundle.outputFiles[0].text,context);
const items = [{product_name:'长'.repeat(200),brand:'品牌'}];
const columns = [{key:'product_name',title:'商品全称',maxAutoWidth:420}, {key:'brand',title:'品牌',maxAutoWidth:220}];
const hook = () => context.Widths.useTableColumnWidths(columns,items);
assert.equal(hook().width('product_name'),420);
const automaticBrand = hook().width('brand');
assert.ok(automaticBrand < 220);
const target = { focus(){}, setPointerCapture(){}, hasPointerCapture(){return true;}, releasePointerCapture(){}, closest(){return { getBoundingClientRect:()=>({width:101}) };} };
const event = { button:0,clientX:100,pointerId:1,currentTarget:target,preventDefault(){},stopPropagation(){} };
hook().handleProps('brand').onPointerDown(event);
hook().handleProps('brand').onPointerMove({...event,clientX:180});
assert.equal(hook().width('brand'),181);
hook().handleProps('brand').onPointerMove({...event,clientX:-999});
assert.equal(hook().width('brand'),64);
hook().handleProps('brand').onPointerUp(event);
assert.equal(drag.current,null);
hook().handleProps('brand').onKeyDown({...event,key:'ArrowRight'});
assert.equal(hook().width('brand'),80);
hook().handleProps('brand').onDoubleClick(event);
assert.equal(hook().width('brand'),automaticBrand);
console.log('共用表格列宽检查通过：内容上限、实测宽度起拖、拖动增宽、最小宽度、释放、键盘与恢复自适应');
