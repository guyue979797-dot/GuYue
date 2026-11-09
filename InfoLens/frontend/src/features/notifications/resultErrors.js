/** Present failures only; omit successful rows, counters and processing metadata. */
export function resultErrors(details = {}) {
  const errors = [];
  const seen = new Set();
  function add(item, fallback = false) {
    if (typeof item === 'string') {
      const message = item.trim();
      if (message && !seen.has(message)) { seen.add(message); errors.push({ message }); }
      return;
    }
    if (!item || typeof item !== 'object') return;
    const failed = /失败|错误|异常|failed|error/i.test(item.result || item.status || '');
    const message = item.error || item.error_information || ((failed || fallback) ? item.reason || item.message : '');
    if (!message) return;
    const row = item.row_number ?? item.row;
    const name = item.product_name || item.customer_name || item.terminal_name;
    const code = item.stock_code || item.product_code || item.terminal_code;
    const identity = [row != null ? `第${row}行` : '', name, code].filter(Boolean).join(' · ');
    const key = `${identity}:${message}`;
    if (!seen.has(key)) { seen.add(key); errors.push({ identity, message: String(message) }); }
  }
  function collect(source) {
    if (!source || typeof source !== 'object') return;
    // Prefer individual errors over their duplicated, joined batch error summary.
    const rows = Array.isArray(source.errors) ? source.errors : [];
    rows.forEach(item => add(item, true));
    if (typeof source.error === 'string') {
      source.error.split('\n').forEach(line => {
        if (!rows.some(item => {
          const message = typeof item === 'string' ? item : item?.error || item?.reason || item?.message;
          return message && line.includes(message);
        })) add(line);
      });
    }
    (Array.isArray(source.details) ? source.details : []).forEach(item => add(item));
  }
  collect(details);
  add(details.product_sync_error);
  collect(details.product_sync);
  return errors;
}
