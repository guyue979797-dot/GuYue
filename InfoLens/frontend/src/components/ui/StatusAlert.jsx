/**
 * 统一状态反馈（正常/加载/空/错误/成功）。
 */
import React from "../../lib/react.js";
import { Alert } from "../../lib/arco.js";

export function StatusAlert({ status, className = "" }) {
  if (!status?.message) return null;
  return (
    <Alert
      className={`status-alert ${className}`.trim()}
      type={status.type || "info"}
      content={status.message}
      showIcon
    />
  );
}

export default StatusAlert;
