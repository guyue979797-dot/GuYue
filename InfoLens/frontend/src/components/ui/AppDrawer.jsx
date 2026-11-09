import React from '../../lib/react.js';
import { useDrawerClose } from './useDrawerClose.js';
import { Drawer } from '../../lib/arco.js';

/** Shared right-side panel: fixed header/footer, one scrolling body, viewport-bounded width. */
export function AppDrawer({ size = 'medium', width, loading = false, dirty = false, maskClosable = true, footer, onCancel, className = '', children, ...props }) {
  const [requestClose, confirming] = useDrawerClose({ loading, dirty, onCancel });
  const resolvedWidth = width ?? ({ small: 520, medium: 720, large: 920 }[size] || 720);
  return <Drawer {...props} placement="right" role="dialog" aria-modal="true"
    aria-label={typeof props.title === 'string' ? props.title : undefined}
    width={typeof resolvedWidth === 'number' ? `min(${resolvedWidth}px, 100vw)` : resolvedWidth}
    className={`app-drawer ${className}`.trim()} maskClosable={maskClosable && !loading && !confirming}
    footer={typeof footer === 'function' ? footer(requestClose) : footer}
    focusLock={!confirming && props.focusLock !== false}
    getChildrenPopupContainer={() => document.body}
    closable={!loading && !confirming && props.closable !== false} escToExit={!loading && !confirming && props.escToExit !== false}
    onCancel={() => requestClose()} unmountOnExit>
    {children}
  </Drawer>;
}
