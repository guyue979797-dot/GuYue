/**
 * 标签告警明细弹窗。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Message, Modal, Spin } from "../../lib/arco.js";
import { TableText } from "../../components/ui/TableText.jsx";
import { getPolicyAlerts } from "../../api/snowPolicies.js";
import { policyAlertTypeClass } from "./constants.js";

export function SnowPolicyAlertsModal({ visible, policy, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !policy) return;
    setItems([]);
    setLoading(true);
    getPolicyAlerts(policy.id)
      .then((data) => setItems(data.items || []))
      .catch((error) => {
        Message.error(`读取告警明细失败：${error.message}`);
      })
      .finally(() => setLoading(false));
  }, [visible, policy]);

  return (
    <Modal
      title={`标签告警明细 · ${policy?.display_name || ""}`}
      visible={visible}
      footer={null}
      onCancel={onClose}
      className="policy-alert-modal"
      unmountOnExit
    >
      <div className="policy-alert-summary">
        共 <strong>{items.length}</strong> 家终端触发告警
      </div>
      <div className="policy-alert-table-wrap">
        <table className="policy-alert-table">
          <colgroup>
            <col className="policy-alert-col-code" />
            <col className="policy-alert-col-name" />
            <col className="policy-alert-col-alerts" />
            <col className="policy-alert-col-ticket" />
            <col className="policy-alert-col-product" />
            <col className="policy-alert-col-type" />
            <col className="policy-alert-col-reason" />
          </colgroup>
          <thead>
            <tr>
              <th>终端编码</th>
              <th>客户全名</th>
              <th>命中告警</th>
              <th>票号</th>
              <th>商品简称</th>
              <th>实际售卖类型</th>
              <th>错误原因</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.terminal_code}>
                <td><span className="policy-code">{item.terminal_code}</span></td>
                <td><TableText value={item.customer_name || "-"} maxWidth={220} /></td>
                <td>
                  <div className="policy-alert-name-list">
                    {(item.alert_names || []).map((name) => (
                      <span
                        key={name}
                        className={policyAlertTypeClass(name)}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="policy-alert-evidence">
                    {(item.details || []).map((detail, index) => (
                      <span key={`${detail.ticket_no}-${detail.row_number}-${index}`}>
                        {detail.ticket_no || "-"}
                      </span>
                    ))}
                    {!(item.details || []).length ? <span>-</span> : null}
                  </div>
                </td>
                <td>
                  <div className="policy-alert-evidence">
                    {(item.details || []).map((detail, index) => (
                      <TableText
                        key={`${detail.ticket_no}-${detail.row_number}-${index}`}
                        value={detail.product_name || "-"}
                        maxWidth={180}
                      />
                    ))}
                    {!(item.details || []).length ? <span>-</span> : null}
                  </div>
                </td>
                <td>
                  <div className="policy-alert-evidence">
                    {(item.details || []).map((detail, index) => (
                      <span key={`${detail.ticket_no}-${detail.row_number}-${index}`}>
                        {detail.actual_sale_type || "-"}
                      </span>
                    ))}
                    {!(item.details || []).length ? <span>-</span> : null}
                  </div>
                </td>
                <td>
                  <div className="policy-alert-evidence">
                    {(item.conflict_policy_names || []).length ? (
                      <span>
                        同时命中：{item.conflict_policy_names.join("、")}
                      </span>
                    ) : null}
                    {item.ticket_count !== null ? (
                      <span>票号去重 {item.ticket_count}，套数限制 {item.set_limit}</span>
                    ) : null}
                    {(item.details || []).map((detail, index) => (
                      <span key={`${detail.ticket_no}-${detail.row_number}-${index}`}>
                        {detail.reason}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <div className="customer-loading"><Spin size={30} /></div> : null}
        {!loading && !items.length ? (
          <div className="policy-alert-empty">暂无告警终端</div>
        ) : null}
      </div>
    </Modal>
  );
}

export default SnowPolicyAlertsModal;
