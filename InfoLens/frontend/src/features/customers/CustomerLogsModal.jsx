/**
 * 客户修改记录弹窗。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Empty, Message, Modal, Spin } from "../../lib/arco.js";
import { getCustomerLogs } from "../../api/customers.js";
import { formatDateTime } from "../../utils/formatters.js";

export function CustomerLogsModal({ visible, customer, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !customer) return;
    setLogs([]);
    setLoading(true);
    getCustomerLogs(customer.id)
      .then((data) => setLogs(data.items || []))
      .catch((error) => {
        setLogs([]);
        Message.error(`读取修改记录失败：${error.message}`);
      })
      .finally(() => setLoading(false));
  }, [visible, customer]);

  return (
    <Modal
      title={`修改记录${customer ? `｜${customer.customer_name}` : ""}`}
      visible={visible}
      footer={null}
      onCancel={onClose}
      className="customer-logs-modal"
      unmountOnExit
    >
      {loading ? (
        <div className="logs-loading"><Spin /></div>
      ) : logs.length ? (
        <div className="customer-timeline">
          {logs.map((log) => (
            <div className="customer-log" key={log.id}>
              <span className={`log-dot ${log.action_type}`} />
              <div>
                <div className="log-meta">
                  <strong>{log.operator_name || log.operator}</strong>
                  <span>{formatDateTime(log.operated_at)}</span>
                </div>
                <div className="log-action">{log.action_summary}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty description="暂无修改记录" />}
    </Modal>
  );
}

export default CustomerLogsModal;
