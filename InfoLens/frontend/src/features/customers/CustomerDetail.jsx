/**
 * 客户档案详情（命令式 Modal.info，仅展示）。
 */
import { Modal } from "../../lib/arco.js";
import { formatDateTime, maskPhone } from "../../utils/formatters.js";

export function showCustomerDetail(customer) {
  Modal.info({
    title: `客户档案详情 · ${customer.customer_name || customer.terminal_code}`,
    width: 560,
    content: (
      <div className="record-detail-grid">
        <div><strong>终端编码</strong><span>{customer.terminal_code || "-"}</span></div>
        <div><strong>客户全名</strong><span>{customer.customer_name || "-"}</span></div>
        <div><strong>终端业态</strong><span>{customer.terminal_business_type || "-"}</span></div>
        <div><strong>状态</strong><span>{customer.status || "-"}</span></div>
        <div><strong>线路归属</strong><span>{customer.route || "-"}</span></div>
        <div><strong>业务员</strong><span>{customer.salesperson || "-"}</span></div>
        <div><strong>雪花业务员</strong><span>{customer.snow_salesperson || "-"}</span></div>
        <div><strong>联系人</strong><span>{customer.contact || "-"}</span></div>
        <div><strong>客户手机</strong><span>{maskPhone(customer.phone)}</span></div>
        <div><strong>客户地址</strong><span>{customer.address || "-"}</span></div>
        <div><strong>备注</strong><span>{customer.remark || "-"}</span></div>
        <div><strong>最后修改</strong><span>{`${formatDateTime(customer.updated_at)} · ${customer.updated_by_name || "-"}`}</span></div>
      </div>
    ),
  });
}
