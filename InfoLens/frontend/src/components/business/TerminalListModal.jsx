/**
 * 终端列表弹窗（跨业务组件：政策钻取、照片归档缺失终端）。
 * - 支持业务员筛选与“复制全部”Excel 单列格式
 */
import React, { useEffect, useRef, useState } from "../../lib/react.js";
import { Button, Empty, Modal, Select, Typography } from "../../lib/arco.js";
import { TableText } from "../ui/TableText.jsx";

const { Text } = Typography;
const { Option } = Select;

function EmptyBox({ text }) {
  return (
    <div className="empty-box">
      <Empty description={text} />
    </div>
  );
}

export function TerminalListModal({
  visible,
  title,
  terminals = [],
  loading = false,
  summaryLabel = "家终端",
  emptyText = "暂无终端",
  showReversalDetails = false,
  onClose,
}) {
  const [business, setBusiness] = useState("");
  const [copyVisible, setCopyVisible] = useState(false);
  const excelTextRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setBusiness("");
      setCopyVisible(false);
    }
  }, [visible, title]);

  const businesses = [...new Set(
    terminals.map((item) => item.salesperson || "").filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const filtered = business
    ? terminals.filter((item) => item.salesperson === business)
    : terminals;

  const excelText = filtered
    .map((item) =>
      String(item.terminal_code || "")
        .replace(/\t/g, " ")
        .replace(/\r?\n/g, " ")
    )
    .join("\n");

  function selectExcelText() {
    const textarea = excelTextRef.current;
    if (!textarea || !filtered.length) return;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  }

  return (
    <Modal
      title={title}
      visible={visible}
      footer={null}
      onCancel={onClose}
      className={
        showReversalDetails
          ? "missing-terminals-modal reversed-terminals-modal"
          : "missing-terminals-modal"
      }
      unmountOnExit
    >
      <div className="missing-terminals-toolbar">
        <div className="missing-terminals-summary">
          <Text type="secondary">
            共 <strong>{filtered.length}</strong> {summaryLabel}
            {business ? `（全部 ${terminals.length} 家）` : ""}
          </Text>
          <Select
            value={business || undefined}
            placeholder="业务员筛选"
            allowClear
            onChange={(value) => setBusiness(value || "")}
          >
            {businesses.map((name) => (
              <Option key={name} value={name}>{name}</Option>
            ))}
          </Select>
        </div>
        <Button
          size="small"
          disabled={!filtered.length}
          onClick={() => setCopyVisible(true)}
        >
          复制全部
        </Button>
      </div>
      {filtered.length ? (
        <div className="missing-terminals-table-wrap">
          <table className="missing-terminals-table">
            <colgroup>
              <col className="mt-col-code" />
              <col className="mt-col-name" />
              <col className="mt-col-sales" />
              {showReversalDetails ? <col className="mt-col-date" /> : null}
              {showReversalDetails ? <col className="mt-col-reason" /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>终端编码</th>
                <th>客户全名</th>
                <th>业务员</th>
                {showReversalDetails ? <th>冲销时间</th> : null}
                {showReversalDetails ? <th>原因（出库单备注）</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((terminal) => (
                <tr key={terminal.terminal_code}>
                  <td><code>{terminal.terminal_code}</code></td>
                  <td>
                    <TableText
                      value={terminal.customer_name}
                      className="missing-customer-name"
                      maxWidth="100%"
                    />
                  </td>
                  <td>
                    <TableText
                      value={terminal.salesperson}
                      maxWidth={90}
                    />
                  </td>
                  {showReversalDetails ? (
                    <td>{terminal.reversal_date || "-"}</td>
                  ) : null}
                  {showReversalDetails ? (
                    <td>
                      <TableText
                        value={terminal.reason || "-"}
                        maxWidth={260}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyBox text={loading ? "正在读取终端明细" : emptyText} />
      )}
      <Modal
        title="复制终端编码"
        visible={copyVisible}
        footer={null}
        onCancel={() => setCopyVisible(false)}
        className="terminal-excel-modal"
        unmountOnExit
      >
        <div className="terminal-excel-toolbar">
          <Text type="secondary">
            已按 Excel 单列格式整理，共 <strong>{filtered.length}</strong> 个终端编码
          </Text>
          <Button
            size="small"
            type="primary"
            disabled={!filtered.length}
            onClick={selectExcelText}
          >
            全选
          </Button>
        </div>
        <textarea
          ref={excelTextRef}
          className="terminal-excel-textarea"
          value={excelText}
          readOnly
          spellCheck={false}
          aria-label="可复制到 Excel 的终端编码"
        />
      </Modal>
    </Modal>
  );
}

export default TerminalListModal;
