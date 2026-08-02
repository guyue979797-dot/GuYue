/**
 * 统一弹窗表单容器（重构要求 16.5 / 5.4）。
 * - 宽度预设：small 520 / medium 720 / large 920
 * - Header/Footer 固定，Content 是唯一纵向滚动区
 * - Select/Dropdown 弹层不被裁切（挂载 document.body）
 */
import React from "../../lib/react.js";
import { Modal } from "../../lib/arco.js";

const MODAL_WIDTH = {
  small: 520,
  medium: 720,
  large: 920,
};

export function FormModal({
  size = "medium",
  width,
  title,
  visible,
  loading = false,
  okText = "保存",
  cancelText = "取消",
  okDisabled = false,
  onCancel,
  onSubmit,
  children,
  className = "",
  footer = null,
  okButtonProps,
  cancelButtonProps,
}) {
  return (
    <Modal
      title={title}
      visible={visible}
      onCancel={onCancel}
      onOk={onSubmit}
      okText={okText}
      cancelText={cancelText}
      width={width ?? MODAL_WIDTH[size]}
      className={`form-modal ${className}`.trim()}
      footer={footer}
      okButtonProps={{
        loading,
        disabled: okDisabled,
        ...okButtonProps,
      }}
      cancelButtonProps={cancelButtonProps}
      unmountOnExit
    >
      {children}
    </Modal>
  );
}

export default FormModal;
