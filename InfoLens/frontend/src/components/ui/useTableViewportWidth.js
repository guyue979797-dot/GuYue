import { useEffect, useState } from '../../lib/react.js';

/** Available table width excludes the vertical scrollbar/gutter. */
export function useTableViewportWidth(viewportRef, loading) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      const body = viewport.querySelector('.arco-table-body');
      setWidth((body || viewport).clientWidth);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    const body = viewport.querySelector('.arco-table-body');
    if (body) observer?.observe(body);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [viewportRef, loading]);
  return width;
}
