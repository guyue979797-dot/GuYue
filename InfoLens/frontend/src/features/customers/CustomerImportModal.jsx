/**
 * 批量新增客户（仅管理员）弹窗。
 */
import React, { useState } from "../../lib/react.js";
import { Alert, Button, Message, Modal } from "../../lib/arco.js";
import {
  downloadImportErrorReport,
  downloadImportTemplate,
  importCustomers,
} from "../../api/customers.js";

export function CustomerImportModal({ visible, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  React.useEffect(() => {
    if (visible) {
      setFile(null);
      setResult(null);
    }
  }, [visible]);

  async function startImport() {
    if (!file) return;
    setImporting(true);
    try {
      const data = await importCustomers(file);
      setResult(data);
      Message.success(`导入完成：成功 ${data.success_count} 条，失败 ${data.failed_count} 条`);
      await onImported?.();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      title="批量新增客户"
      visible={visible}
      onCancel={onClose}
      onOk={startImport}
      okText="开始导入"
      okButtonProps={{ loading: importing, disabled: !file }}
      className="customer-import-modal"
      unmountOnExit
    >
      <div className="customer-import-guide">
        <Alert
          type="info"
          showIcon
          content="建议使用标准模板上传 .xlsx 文件。合法行正常录入，失败行不会录入。"
        />
        <Button onClick={downloadImportTemplate}>
          下载标准模板
        </Button>
      </div>
      <label className="customer-file-picker">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setResult(null);
          }}
        />
        <span>{file ? file.name : "请上传文档"}</span>
      </label>
      {result ? (
        <div className="import-result">
          <div><strong>{result.total_count}</strong><span>总行数</span></div>
          <div className="success"><strong>{result.success_count}</strong><span>成功</span></div>
          <div className="danger"><strong>{result.failed_count}</strong><span>失败</span></div>
          {result.error_report_url ? (
            <Button onClick={() => downloadImportErrorReport(result.error_report_url)}>
              下载失败明细
            </Button>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default CustomerImportModal;
