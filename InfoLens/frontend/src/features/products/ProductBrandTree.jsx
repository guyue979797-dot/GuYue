import React from '../../lib/react.js';
import { Tree } from '../../lib/arco.js';

export function ProductBrandTree({ brands, selectedKey, onSelect }) {
  const total = brands.reduce((sum, item) => sum + item.count, 0);
  const unbranded = brands.find(item => !item.brand)?.count || 0;
  const nodes = [{ key: 'all', title: `全部商品（${total}）`, children: [
    ...brands.filter(item => item.brand).map(item => ({ key: `brand:${item.brand}`, title: `${item.brand}（${item.count}）` })),
    { key: 'unbranded', title: `未设置品牌（${unbranded}）` },
  ] }];
  return <aside className="product-brand-panel" aria-label="品牌筛选">
    <strong className="product-brand-title">品牌分类</strong>
    <Tree treeData={nodes} blockNode defaultExpandedKeys={['all']} selectedKeys={[selectedKey]}
      onSelect={keys => { if (keys.length) onSelect(keys[0]); }} />
  </aside>;
}
