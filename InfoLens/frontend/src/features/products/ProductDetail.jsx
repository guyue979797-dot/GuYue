import React from '../../lib/react.js';
import { Tag } from '../../lib/arco.js';
import { formatDateTime } from '../../utils/formatters.js';

export function ProductDetails({ product }) {
  if (!product) return null;
  const money = value => value == null ? '—' : `¥ ${Number(value).toFixed(2)}`;
  const fields = [
    ['存货编号', (product.housekeeper_codes || []).join('、')],
    ['品牌', product.brand], ['商品', product.short_name],
    ['状态', <Tag color={product.status === '正常' ? 'green' : product.status === '下线' ? 'gray' : 'gold'}>{product.status}</Tag>],
    ['成本价', money(product.cost_price)], ['雪花结算价', money(product.settlement_price)],
    ['等级', product.grade],
    ['规格', product.specification != null && product.auxiliary_unit ? `1箱 = ${product.specification}${product.auxiliary_unit}` : '待补充'],
    ['雪花库存', `${product.snow_inventory ?? 0} 箱`], ['商品全称', product.product_name],
    ['商品编码', (product.product_codes || []).join('、')],
    ['创建人', product.created_by_name], ['创建时间', product.created_at ? formatDateTime(product.created_at) : '—'],
    ['最后修改人', product.updated_by_name], ['最后修改时间', product.updated_at ? formatDateTime(product.updated_at) : '—'],
  ];
  return <dl className="product-detail-fields">{fields.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? '—' : value}</dd></div>)}</dl>;
}
