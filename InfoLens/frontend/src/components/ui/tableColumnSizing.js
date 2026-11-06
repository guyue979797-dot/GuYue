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
    let width = measure(title) + 48;
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
