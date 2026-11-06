// 顺序及名称按销售明细展示要求配置；source 保留原始字段名称。
export const SALES_COLUMNS = [
  ['年月', '单据年月', 120],
  ['单据日期', '单据日期', 140],
  ['单据类型', '单据类型', 140],
  ['单据编号', '单据编号', 240],
  ['经办人', '经办人全名', 140],
  ['客户全名', '客户全名', 240],
  ['终端编码', '客户备用2', 180],
  ['客户类型', '客户备用4', 140],
  ['分类', '分类', 140],
  ['存货全名', '存货全名', 240],
  ['合计（件）', null, 140],
  ['辅1数量', '辅1数量', 140],
  ['赠品辅1数量', '赠品辅1数量', 140],
  ['单价', '折后单价', 140],
  ['真实单价', '真实单价', 140],
  ['成本', '利润参考成本价', 140],
  ['单件利润', '单件利润', 140],
  ['利润率', '利润率', 140],
  ['金额', '折后金额', 140],
  ['真实金额', '真实金额', 140],
  ['行摘要', '行摘要', 280],
  ['单据摘要', '单据摘要', 280],
  ['生产日期', '生产日期', 140],
  ['到期时间', '到期日期', 140],
  ['批号', '批号', 160],
  ['仓库全名', '仓库全名', 180],
  ['搭赠匹配商品', '搭赠匹配商品', 240],
  ['成本来源', '成本来源', 320],
].map(([title, source, width]) => ({ title, source, width }));

export function salesCellValue(values, column) {
  if (column.source) return values[column.source];
  const quantity = (field) => {
    const raw = values[field];
    return raw == null || raw === '' ? 0 : Number(String(raw).replaceAll(',', ''));
  };
  const total = quantity('辅1数量') + quantity('赠品辅1数量');
  return Number.isFinite(total) ? Number(total.toFixed(12)) : null;
}

export function hiddenSalesFields(fields) {
  const visible = new Set(SALES_COLUMNS.map((column) => column.source).filter(Boolean));
  return fields.filter((field) => !visible.has(field));
}
