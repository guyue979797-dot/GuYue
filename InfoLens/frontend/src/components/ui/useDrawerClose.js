import { useEffect, useRef, useState } from '../../lib/react.js';
import { Modal } from '../../lib/arco.js';

/** One dismissal path for mask, Esc, close icon and footer cancellation. */
export function useDrawerClose({ loading, dirty, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.close?.(), []);
  function requestClose(action) {
    if (loading || pending.current) return;
    const close = typeof action === 'function' ? action : onCancel;
    if (!dirty) { close?.(); return; }
    setConfirming(true);
    pending.current = Modal.confirm({
      title: '放弃未保存的修改？',
      content: '关闭后，本次修改不会保存。',
      okText: '放弃修改', cancelText: '继续编辑',
      maskClosable: false,
      getPopupContainer: () => document.body,
      onOk: () => close?.(),
      afterClose: () => { pending.current = null; setConfirming(false); },
    });
  }
  return [requestClose, confirming];
}
