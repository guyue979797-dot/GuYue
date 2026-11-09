import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
let state=[], cursor=0, effects=[], effectCursor=0, saved=null, failure=false, closed=false, payload=null;
const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),
  useState: initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
  useEffect:(fn,deps)=>{const i=effectCursor++;if(!effects[i]||deps.some((value,j)=>value!==effects[i][j])){effects[i]=deps;fn();}}};
const Drawer=()=>{},Button=()=>{},Input=()=>{},Select=()=>{};Select.Option=()=>{};
const context={window:{React,arco:{Typography:{},Drawer,Button,Input,Select,Space:()=>{},Tag:()=>{},Message:{success(){},error(){}}}},document:{body:{}},
  request:async(id,value)=>{payload=value;if(failure)throw new Error('版本冲突');return {...value,id,version:3};}};
vm.createContext(context);
const bundle=await build({entryPoints:['src/features/products/ProductDrawer.jsx'],bundle:true,write:false,format:'iife',globalName:'Module',jsxFactory:'React.createElement',
 plugins:[{name:'api',setup(builder){builder.onLoad({filter:/api\/products\.js$/},()=>({contents:'export const updateProduct=(id,payload)=>globalThis.request(id,payload);export const createProduct=payload=>globalThis.request(99,payload);',loader:'js'}));}}]});
vm.runInContext(bundle.outputFiles[0].text,context);
const product={id:7,version:2,product_codes:['P'],housekeeper_codes:['G'],short_name:'测试商品',product_name:'测试商品全称',brand:'自定义品牌',grade:'自定义等级',status:'正常',snow_inventory:10,specification:12,auxiliary_unit:'听',cost_price:null,settlement_price:null};
let props={visible:true,product,mode:'edit',onSaved:value=>{saved=value;},onClose:()=>{closed=true;},onModeChange:()=>{}};
function render(){cursor=0;effectCursor=0;return context.Module.ProductDrawer(props);}
function footerNodes(tree) { return nodes(typeof tree.props.footer === 'function' ? tree.props.footer(action => typeof action === 'function' ? action() : props.onClose()) : tree.props.footer); }
function nodes(value){if(!value||typeof value!=='object')return[];if(Array.isArray(value))return value.flatMap(nodes);return[value,...nodes(value.props?.children)];}
render();let tree=render();
const { visibleText } = await import('../src/components/ui/tableColumnSizing.js');
const labels = nodes(tree).filter(node=>node.type==='label').map(node=>visibleText(node.props.children).replaceAll('*','').trim());
assert.deepEqual(labels,['存货编号','品牌','商品','状态','成本价','雪花结算价','等级','规格','雪花库存（箱）','商品全称','商品编码']);
let save=footerNodes(tree).find(node=>node.type===Button&&node.props.children==='保存修改');
assert.equal(save.props.disabled,false);await save.props.onClick();
assert.equal(payload.version,2);assert.equal(payload.cost_price,null);assert.equal(payload.settlement_price,null);
assert.equal(payload.brand,'自定义品牌');assert.equal(payload.grade,'自定义等级');assert.equal(saved.version,3);assert.equal(closed,false);
failure=true;saved=null;tree=render();save=footerNodes(tree).find(node=>node.type===Button&&node.props.children==='保存修改');await save.props.onClick();assert.equal(saved,null);assert.equal(closed,false);
props={...props,mode:'create',product:null};render();tree=render();
assert.equal(footerNodes(tree).find(node=>node.props?.children==='确认新增').props.disabled,true);
props={...props,mode:'detail',product};render();tree=render();
assert.ok(footerNodes(tree).some(node=>node.props?.children==='编辑'));
console.log('商品抽屉检查通过：空价格、自定义字段、版本号、保存返回详情数据、错误保留编辑、创建校验与详情入口');
