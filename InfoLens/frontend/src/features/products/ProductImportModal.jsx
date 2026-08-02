/**
 * 上传产品明细弹窗（解析预览 → 确认合并更新）。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Alert, Message, Modal, Tag } from "../../lib/arco.js";
import { TableText } from "../../components/ui/TableText.jsx";
import { commitProductImport, previewProductImport } from "../../api/products.js";

export function ProductImportModal({ visible, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setPreview(null);
  }, [visible]);

  async function previewFile() {
    if (!file) return;
    setPreviewing(true);
    try {
      const data = await previewProductImport(file);
      setPreview(data);
      Message.success("文件解析完成，请确认合并更新结果");
    } catch (error) {
      Message.error(error.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function commitImport() {
    if (!preview?.preview_id) return;
    setCommitting(true);
    try {
      const result = await commitProductImport(preview.preview_id);
      onClose();
      await onImported?.();
      Message.success(
        `更新完成：新增待完善${result.created_count}条，更新${result.updated_count}条，` +
        `仅月度汇总${result.summary_only_count || 0}条，跳过${result.skipped_count}条`
      );
    } catch (error) {
      Message.error(error.message);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Modal
      title="上传产品明细"
      visible={visible}
      onCancel={() => {
        if (!committing) onClose();
      }}
      onOk={preview ? commitImport : previewFile}
      okText={preview ? "确认合并更新" : "解析并预览"}
      okButtonProps={{
        loading: preview ? committing : previewing,
        disabled: preview ? Boolean(preview.failed_count) : !file,
      }}
      cancelButtonProps={{ disabled: committing }}
      className="product-upload-modal"
      unmountOnExit
    >
      <div className="product-upload-layout">
        <Alert
          type="info"
          showIcon
          content="读取“年月、商品编号、商品名称、单位、入库千升数、可用（箱）”；本月箱装商品合并到产品明细，历史月份仅保存月度汇总。"
        />
        <label className="snow-file-picker">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
            }}
          />
          <span className="snow-file-icon">XL</span>
          <span>
            <strong>{file ? file.name : "请选择雪花库存 Excel"}</strong>
            <small>
              {file ? `${(file.size / 1024).toFixed(1)} KB` : "库存取“可用（箱）”，上传采用合并更新"}
            </small>
          </span>
        </label>
        {preview ? (
          <>
            <div className="product-import-summary">
              <div><strong>{preview.total_count}</strong><span>总行数</span></div>
              <div className="success"><strong>{preview.created_count}</strong><span>新增待完善</span></div>
              <div><strong>{preview.updated_count}</strong><span>更新</span></div>
              <div><strong>{preview.unchanged_count}</strong><span>无变化</span></div>
              <div className="warning"><strong>{preview.skipped_count}</strong><span>跳过</span></div>
              <div><strong>{preview.summary_only_count || 0}</strong><span>仅月度汇总</span></div>
              <div className="warning"><strong>{preview.warning_count}</strong><span>解析提示</span></div>
              <div className="danger"><strong>{preview.failed_count}</strong><span>失败</span></div>
            </div>
            {preview.failed_count ? (
              <Alert type="error" showIcon content="文件存在失败记录，请修正后重新上传。" />
            ) : null}
            <div className="product-import-table-wrap">
              <table className="product-import-table">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>商品编号</th>
                    <th>商品名称</th>
                    <th>处理结果</th>
                    <th>提示</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.details || []).map((item) => (
                    <tr key={`${item.row_number}-${item.product_code}`}>
                      <td>{item.row_number}</td>
                      <td><span className="product-mono">{item.product_code}</span></td>
                      <td><TableText value={item.product_name} maxWidth={260} /></td>
                      <td>
                        <Tag
                          color={
                            item.result === "失败"
                              ? "red"
                              : item.result === "跳过"
                                ? "gold"
                                : item.result === "新增待完善"
                                  ? "arcoblue"
                                  : "green"
                          }
                        >
                          {item.result}
                        </Tag>
                      </td>
                      <td>{item.message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export default ProductImportModal;
