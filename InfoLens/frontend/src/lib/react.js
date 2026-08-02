/**
 * 桥接模块：从运行时全局 React 暴露标准模块导出。
 * 构建产物保持 react-globals.js → index-arco.js 的加载顺序，
 * 业务代码一律从此模块导入，不再直接访问 window.React。
 */
const React = window.React;

export default React;
export const {
  Fragment,
  createElement,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useContext,
  useReducer,
} = React;
