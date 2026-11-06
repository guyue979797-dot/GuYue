import React from '../../lib/react.js';
import { Drawer } from '../../lib/arco.js';

/** Shared right-side panel: fixed header/footer, one scrolling body, viewport-bounded width. */
export function AppDrawer({ size = 'medium', width, loading = false, onCancel, className = '', children, ...props }) {
  const resolvedWidth = width ?? ({ small: 520, medium: 720, large: 920 }[size] || 720);
  return <Drawer {...props} placement="right"
    width={typeof resolvedWidth === 'number' ? `min(${resolvedWidth}px, 100vw)` : resolvedWidth}
    className={`app-drawer ${className}`.trim()} maskClosable={false}
    getChildrenPopupContainer={() => document.body}
    closable={!loading && props.closable !== false} escToExit={!loading && props.escToExit !== false}
    onCancel={() => { if (!loading) onCancel?.(); }} unmountOnExit>
    {children}
  </Drawer>;
}
