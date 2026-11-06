import assert from 'node:assert/strict';
import { getPolicyMonthOptions } from '../src/features/products/policies/constants.js';
assert.equal(getPolicyMonthOptions(2001).filter(option => option.year === 2001).length, 12);
assert.equal(getPolicyMonthOptions(10000).filter(option => option.year === 10000).length, 0);
import vm from 'node:vm';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
const Button = () => {}, Input = () => {}, Select = () => {}, MonthPicker = () => {}, RangePicker = () => {};
Select.Option = () => {};
const context = { window: { React, arco: { Button, Input, Select, DatePicker: { MonthPicker, RangePicker }, Space: () => {}, Tag: () => {}, Typography: { Ellipsis: () => {} } } }, document: { body: {} } };
const output = await build({ entryPoints: [resolve(root, 'src/components/ui/FilterBar.jsx')], bundle: true, write: false,
  format: 'iife', globalName: 'Filters', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' });
vm.createContext(context); vm.runInContext(output.outputFiles[0].text, context);
const { FilterBar, groupFilterFields, sameFilterValue } = context.Filters;
const fields = [
  { name: 'status', type: 'select', label: '状态', options: [{ value: 0, label: '零' }] },
  { name: 'month', type: 'month', label: '月份' },
  { name: 'code', type: 'input', label: '编码', row: 1, group: 'identity' },
  { name: 'customer', type: 'input', label: '客户', row: 1, group: 'identity' },
  { name: 'categories', type: 'multi-select', label: '分类', row: 1, options: ['销售', '搭赠'] },
  { name: 'dates', type: 'date-range', label: '日期', row: 1 },
];
assert.equal(sameFilterValue(['A'], ['B']), false);
assert.equal(sameFilterValue(['A'], ['A']), true);
const rows = groupFilterFields(fields);
assert.equal(rows.length, 2); assert.equal(rows[1][0].fields.length, 2);
const values = { status: 0, month: '2026-10', code: '001', customer: '', categories: ['销售'], dates: [] };
let next, searches = 0, resets = 0;
const tree = FilterBar({ fields, values, onChange: value => { next = value; }, onSearch: () => searches++, onReset: () => resets++ });
function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...(node.children || []).flatMap(flatten)];
}
const nodes = flatten(tree);
const actions = nodes.filter(node => node.type === Button);
assert.equal(actions.length, 2); actions[0].props.onClick(); actions[1].props.onClick();
assert.equal(searches, 1); assert.equal(resets, 1);
const inputs = nodes.filter(node => node.type === Input);
inputs[0].props.onPressEnter(); assert.equal(searches, 2);
inputs[0].props.onChange('002'); assert.equal(next.code, '002'); assert.equal(next.status, 0); assert.equal(values.code, '001');
const selects = nodes.filter(node => node.type === Select);
assert.equal(selects[0].props.value, 0);
selects[1].props.onChange(['销售', '搭赠']); assert.deepEqual(next.categories, ['销售', '搭赠']);
selects[1].props.onChange(undefined); assert.equal(next.categories.length, 0);
assert.equal(selects[0].props.getPopupContainer(), context.document.body);
nodes.find(node => node.type === MonthPicker).props.onChange('2026-11'); assert.equal(next.month, '2026-11');
nodes.find(node => node.type === RangePicker).props.onChange(['2026-10-01', '2026-10-31']); assert.equal(next.dates.length, 2);
assert.equal(flatten(FilterBar({ fields, showActions: false })).filter(node => node.type === Button).length, 0);
console.log('统一筛选组件检查通过：分行/组合、查询/重置/回车、多选、月份/日期、零值、弹层挂载');

async function featureModule(file, name) {
  const bundle = await build({ entryPoints: [resolve(root, file)], bundle: true, write: false,
    format: 'iife', globalName: name, jsxFactory: 'React.createElement' });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return context[name];
}
const customers = await featureModule('src/features/customers/CustomerFilters.jsx', 'CustomerModule');
const customerValues = { policyMonth: '2026-07', policyTag: '', route: ['A'], people: [], terminal_code: '', customer_name: '' };
let customerChange;
const customerTree = customers.CustomerFilters({ values: customerValues,
  onDraftChange: (key, value) => { customerChange = [key, value]; },
  onPolicyTagChange: value => { customerChange = ['tag', value]; },
});
customerTree.props.onChange({ ...customerValues, route: ['B'] }); assert.deepEqual(customerChange, ['route', ['B']]);
assert.equal(customerTree.props.fields.some(field => field.name === 'policyMonth'), false);
customerTree.props.onChange({ ...customerValues, policyTag: 'P1' }); assert.deepEqual(customerChange, ['tag', 'P1']);
const policies = await featureModule('src/features/products/policies/SnowPolicyFilters.jsx', 'PolicyModule');
let policyChange;
const policyValues = { yearMonth: '', enabled: '', outbound_code: '', name: '' };
const policyTree = policies.SnowPolicyFilters({ values: policyValues,
  onDraftChange: (key, value) => { policyChange = [key, value]; },
  onYearMonthChange: value => { policyChange = ['month', value]; },
});
policyTree.props.onChange({ ...policyValues, enabled: 'false' }); assert.deepEqual(policyChange, ['enabled', 'false']);
policyTree.props.onChange({ ...policyValues, yearMonth: '202607' }); assert.deepEqual(policyChange, ['month', '202607']);
console.log('客户与政策筛选适配回调验证通过');

// 多选折叠必须交由容器测量，隐藏内容弹层挂到 body。
assert.equal(selects[1].props.maxTagCount.count, 'responsive');
assert.equal(selects[1].props.maxTagCount.popoverProps.getPopupContainer(), context.document.body);
assert.equal(selects[1].props.maxTagCount.render(3).children[0], '+');
assert.equal(selects[1].props.maxTagCount.render(3).children[1], 3);
const textModule = await featureModule('src/components/ui/TableText.jsx', 'TextModule');
const text = textModule.TableText({ value: '完整长文本' });
assert.equal(text.props.style.width, '100%');
assert.equal(text.props.showTooltip.content, '完整长文本');
assert.equal(text.props.showTooltip.getPopupContainer(), context.document.body);
assert.equal(textModule.TableText({ value: '', maxWidth: 180 }).props.showTooltip, false);
assert.equal(textModule.TableText({ value: '长文本', maxWidth: 180 }).props.style.maxWidth, 'min(100%, 180px)');
console.log('容器自适应多选、隐藏选项提示、表格长文本与空值验证通过');
