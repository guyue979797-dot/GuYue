import { formatCompactDateTime } from "../../utils/formatters.js";
export const PRODUCT_AUTO_LIMITS = { product_name: 420, short_name: 260, product_codes: 320, housekeeper_codes: 260, updated_at: 240 };

export function policyCostText(policy) {
  return `¥${Number(policy.price).toFixed(2)}（${Number(policy.remaining_quantity).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}）`;
}

export function productWidthText(product, key) {
  if (key === 'actions') return '详情　···';
  if (key === 'policy_costs') return product.policy_costs?.length ? product.policy_costs.map(policyCostText).join('\n') : '-';
  if (key === 'cost_price' || key === 'settlement_price') return product[key] == null ? '-' : `¥${Number(product[key]).toFixed(2)}`;
  if (key === 'specification') return product.specification != null && product.auxiliary_unit ? `1箱 = ${product.specification}${product.auxiliary_unit}` : '待补充';
  if (key === 'snow_inventory') return Number(product.snow_inventory).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  if (key === 'updated_at') return `${formatCompactDateTime(product.updated_at)}　${product.updated_by_name || '-'}`;
  return Array.isArray(product[key]) ? product[key].join('　') : String(product[key] || '-');
}
