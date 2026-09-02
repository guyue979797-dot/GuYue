/**
 * 测量容器可用高度，用于 DataTable 的 scrollY（表头固定 + 单一纵向滚动）。
 */
import { useEffect, useRef, useState } from "../lib/react.js";

export function useContainerHeight(offset = 0) {
  const ref = useRef(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      setHeight(Math.max(160, node.clientHeight - offset));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [offset]);

  return [ref, height];
}

export default useContainerHeight;
