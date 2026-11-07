// Page and Excel export share the same field names and order.
import columns from "../../../../infolens/sales_columns.json";
export const SALES_COLUMNS = columns;

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
