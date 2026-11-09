/**
 * 政策出库进度数字钻取（跨业务组件）。
 */
import React from "../../lib/react.js";

export function PolicyProgressCell({
  displayName,
  shipped,
  requiresPhoto,
  photographed,
  pending,
  alertCount,
  reversed,
  onShippedClick,
  onPhotographedClick,
  onPendingClick,
  onAlertClick,
  onReversedClick,
}) {
  const renderStatus = ({ key, label, value, tone = "primary", onClick }) => (
    <button
      key={key}
      className={`status-item ${tone} ${Number(value || 0) === 0 ? "is-zero" : ""}`.trim()}
      type="button"
      onClick={onClick}
      aria-label={`查看 ${displayName || "该政策"} ${label}明细`}
    >
      <span className="status-label">{label}</span>
      <span className="status-value">{Number(value || 0)}</span>
    </button>
  );

  const statusItems = [
    ...(requiresPhoto
      ? [
          { key: "photographed", label: "拍照", value: photographed, onClick: onPhotographedClick },
          { key: "pending", label: "待出库", value: pending, onClick: onPendingClick },
        ]
      : []),
    { key: "alert", label: "告警", value: alertCount, tone: "alert", onClick: onAlertClick },
    { key: "reversed", label: "已冲销", value: reversed, onClick: onReversedClick },
  ];

  return (
    <div className="outbound-status" aria-label={`${displayName || "该政策"} 出库状态`}>
      {renderStatus({ key: "shipped", label: "已出库", value: shipped, onClick: onShippedClick })}
      {statusItems.map((status) => (
        <React.Fragment key={status.key}>
          <span className="status-sep" aria-hidden="true">·</span>
          {renderStatus(status)}
        </React.Fragment>
      ))}
    </div>
  );
}

export default PolicyProgressCell;
