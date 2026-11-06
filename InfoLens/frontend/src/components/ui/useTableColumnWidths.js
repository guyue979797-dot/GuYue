import { useMemo, useRef, useState } from '../../lib/react.js';
import { automaticWidths, columnKey, visibleText } from './tableColumnSizing.js';


export function useTableColumnWidths(columns, data) {
  const [manual, setManual] = useState({});
  const drag = useRef(null);
  const labels = Object.fromEntries(columns.map((column, index) => [columnKey(column,index), column.widthLabel || visibleText(column.title) || '列']));
  const automatic = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (context) context.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    return automaticWidths(columns, data, text => context ? context.measureText(text).width : [...text].length * 13);
  }, [columns, data]);
  function minimum(key) { return columns.find((column, index) => columnKey(column,index) === key)?.minWidth ?? 64; }
  function resize(key, width) { setManual(previous => ({ ...previous, [key]: Math.max(minimum(key), Math.min(1200, Math.round(width))) })); }
  function reset(key) { setManual(previous => { const next = { ...previous }; delete next[key]; return next; }); }
  const width = key => manual[key] ?? automatic[key];
  function handleProps(key) {
    return {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical',
      'aria-label': `调整${labels[key]}列宽`, 'aria-valuenow': width(key), 'aria-valuemin': minimum(key), 'aria-valuemax': 1200,
      title: '拖动调整列宽；双击恢复自适应；方向键微调',
      onClick: event => event.stopPropagation(),
      onDoubleClick: event => { event.stopPropagation(); reset(key); },
      onPointerDown: event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus();
        drag.current = { key, start: event.clientX, width: event.currentTarget.closest("th")?.getBoundingClientRect().width || width(key) };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: event => { if (drag.current?.key === key) resize(key, drag.current.width + event.clientX - drag.current.start); },
      onPointerUp: event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
      onLostPointerCapture: () => { drag.current = null; },
      onKeyDown: event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); event.stopPropagation(); resize(key, width(key) + (event.key === 'ArrowRight' ? 16 : -16));
        } else if (event.key === 'Home') { event.preventDefault(); reset(key); }
      },
    };
  }
  return { width, handleProps };
}
