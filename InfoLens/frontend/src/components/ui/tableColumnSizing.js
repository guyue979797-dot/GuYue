/** Width policy uses displayed text, never hidden tooltip content or menu data. */
export function visibleText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(' ');
  const props = node.props;
  if (!props) return '';
  if (props.children != null) return visibleText(props.children);
  if (props.value != null) return visibleText(props.value);
  if (props.values != null) return visibleText(props.values);
  if (props.name != null) return visibleText(props.name);
  if (typeof props.title === 'string') return props.title;
  if (props.onDetail) return `${props.detailLabel || '详情'}　⋯`;
  return '';
}
export function columnKey(column, index) { return String(column.key ?? column.dataIndex ?? index); }
export function columnValue(record, column) {
  if (typeof column.dataIndex === 'string') return column.dataIndex.split('.').reduce((value, key) => value?.[key], record);
  return record?.[column.key];
}
export function automaticWidths(columns, data, measure) {
  return Object.fromEntries(columns.map((column, index) => {
    const key = columnKey(column, index);
    const title = column.widthLabel || visibleText(column.title) || key;
    const max = column.maxAutoWidth ?? 360;
    const min = column.minWidth ?? 80;
    // Sort controls occupy space in the header, independently of body values.
    let width = measure(title) + 48 + (column.sorter ? 20 : 0);
    for (let row = 0; row < data.length; row++) {
      const record = data[row];
      const value = columnValue(record, column);
      const text = column.widthText ? String(column.widthText(record) ?? '')
        : visibleText(column.render ? column.render(value, record, row) : value);
      // Multiline evidence is measured by its longest line rather than its combined length.
      for (const line of text.split('\n')) width = Math.max(width, measure(line) + 48);
      if (width >= max) break;
    }
    return [key, Math.ceil(Math.max(min, Math.min(max, width)))];
  }));
}

/** Fill unused space proportionally; preserve manually sized columns when others can grow. */
export function fillColumnWidths(widths, availableWidth, manual = {}) {
  const entries = Object.entries(widths);
  const total = entries.reduce((sum, [, width]) => sum + width, 0);
  const extra = Math.floor(availableWidth) - total;
  if (!entries.length || !Number.isFinite(extra) || extra <= 0) return widths;
  let flexible = entries.filter(([key]) => manual[key] == null);
  // Even an entirely manually sized table must still cover its container.
  if (!flexible.length) flexible = entries;
  const weight = flexible.reduce((sum, [, width]) => sum + width, 0);
  const result = { ...widths };
  let cumulative = 0;
  let distributed = 0;
  for (const [key, width] of flexible) {
    cumulative += width;
    const next = Math.round(extra * cumulative / weight);
    result[key] += next - distributed;
    distributed = next;
  }
  return result;
}
