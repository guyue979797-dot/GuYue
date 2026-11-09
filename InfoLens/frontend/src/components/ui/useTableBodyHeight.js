import { useEffect, useRef, useState } from '../../lib/react.js';

/** Fit the body below its real header, inside the viewport above pagination. */
export function useTableBodyHeight(maxHeight, fitContainer) {
  const viewportRef = useRef(null);
  const [measuredHeight, setMeasuredHeight] = useState(undefined);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!fitContainer || !Number.isFinite(maxHeight) || !viewport) return undefined;
    const measure = () => {
      const body = viewport.querySelector('.arco-table-body');
      const bounds = viewport.getBoundingClientRect();
      if (!body || bounds.bottom <= bounds.top) return;
      const available = Math.max(1, Math.floor(bounds.bottom - body.getBoundingClientRect().top - 1));
      setMeasuredHeight(Math.min(maxHeight, available));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    const header = viewport.querySelector('.arco-table-header');
    if (header) observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [maxHeight, fitContainer]);

  return [viewportRef, fitContainer && Number.isFinite(maxHeight) && measuredHeight !== undefined
    ? Math.min(maxHeight, measuredHeight) : maxHeight];
}
