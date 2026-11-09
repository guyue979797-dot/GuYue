import React from '../../lib/react.js';
import { Button, Space } from '../../lib/arco.js';
import { AppDrawer } from './AppDrawer.jsx';

/** Business forms and drill-downs share busy/disabled/close semantics. */
export function FormDrawer({ onSubmit, onOk, onCancel, loading = false, confirmLoading = false,
  okDisabled = false, okText = '保存', cancelText, okButtonProps = {}, cancelButtonProps = {},
  footer, children, className = "", ...props }) {
  const busy = Boolean(loading || confirmLoading || okButtonProps.loading);
  const disabled = Boolean(okDisabled || okButtonProps.disabled || busy);
  const submit = onSubmit || onOk;
  const defaultFooter = (requestClose) => <Space>
    <Button {...cancelButtonProps} disabled={busy || cancelButtonProps.disabled}
      onClick={() => { if (!busy) requestClose(); }}>{cancelText || (submit ? '取消' : '关闭')}</Button>
    {submit && <Button {...okButtonProps} type="primary" loading={busy} disabled={disabled}
      onClick={() => { if (!disabled) return submit(); }}>{okText}</Button>}
  </Space>;
  return <AppDrawer {...props} className={`form-drawer ${className}`.trim()} loading={busy} onCancel={onCancel} footer={footer === undefined ? defaultFooter : footer}>
    {children}
  </AppDrawer>;
}
