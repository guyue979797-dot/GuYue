/**
 * 雪花出库上传弹窗（跨业务组件：终端明细 / 雪花政策共用）。
 * 交互：选择文件 → 解析预览 → 确认覆盖并导入。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Alert, Checkbox, Message, Modal } from "../../lib/arco.js";
import {
  importSnowOutbound,
  previewSnowOutbound,
} from "../../api/snowPolicies.js";

export function SnowOutboundUploadModal({ visible, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [updatePolicy, setUpdatePolicy] = useState(true);
  const [preview, setPreview] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setUpdatePolicy(true);
    setPreview(null);
    setErrorMessage("");
  }, [visible]);

  async function previewFile() {
    if (!file) return;
    setPreviewing(true);
    setErrorMessage("");
    try {
      const data = await previewSnowOutbound(file, updatePolicy);
      setPreview(data);
      try {
        Message.success("文件解析完成，请确认覆盖月份及命中结果");
      } catch {
        // 预览区域本身会展示成功结果，不让消息组件异常影响主流程。
      }
    } catch (error) {
      setErrorMessage(error.message || "文件解析失败");
      try {
        Message.error(error.message || "文件解析失败");
      } catch {
        // 错误会固定展示在弹窗内。
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function commitImport() {
    if (!preview?.preview_id) return;
    setCommitting(true);
    setErrorMessage("");
    try {
      const data = await importSnowOutbound(preview.preview_id);
      onClose();
      await onImported?.(data);
      Message.success(
        `导入完成：${data.row_count}条明细，${data.tag_count}个政策标签，自动建档${data.auto_customer_count}家`
      );
    } catch (error) {
      setErrorMessage(error.message || "导入失败");
      try {
        Message.error(error.message || "导入失败");
      } catch {
        // 错误会固定展示在弹窗内。
      }
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Modal
      title="雪花出库上传"
      visible={visible}
      onCancel={() => {
        if (!committing) onClose();
      }}
      onOk={preview ? commitImport : previewFile}
      okText={preview ? "确认覆盖并导入" : "解析并预览"}
      okButtonProps={{
        loading: preview ? committing : previewing,
        disabled: preview ? false : !file,
      }}
      cancelButtonProps={{ disabled: committing }}
      className="snow-upload-modal"
      unmountOnExit
    >
      <div className="snow-upload-layout">
        <Alert
          type="info"
          showIcon
          content="按开票日期分月保存最新出库数据；负数折合箱数会保存，但不会参与政策标签计算。"
        />

        <section className="snow-section">
          <div className="snow-section-title">
            <strong>1. 选择出库文件</strong>
          </div>
          <label className="snow-file-picker">
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setPreview(null);
                setErrorMessage("");
              }}
            />
            <span className="snow-file-icon">XL</span>
            <span>
              <strong>{file ? file.name : "仅支持雪花系统导出的出库 Excel"}</strong>
              <small className={file ? "" : "snow-file-warning"}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "请勿上传其他表格，传错文件可能导致数据错乱"}
              </small>
            </span>
          </label>
        </section>

        <section className="snow-section snow-update-option">
          <div>
            <strong>2. 更新终端客户的雪花政策标签</strong>
            <span className="snow-update-warning">
              注意：仅更新对应年月中已启用的政策标签，未启用的政策标签不会更新。
            </span>
          </div>
          <Checkbox
            aria-label="是否更新终端客户的雪花政策标签"
            checked={updatePolicy}
            onChange={(checked) => {
              setUpdatePolicy(checked);
              setPreview(null);
              setErrorMessage("");
            }}
          />
        </section>

        {errorMessage ? (
          <Alert
            type="error"
            showIcon
            content={errorMessage}
          />
        ) : null}

        {preview ? (
          <section className="snow-section snow-preview-section">
            <div className="snow-section-title">
              <strong>解析预览</strong>
            </div>
            <div className="snow-preview-grid">
              <div><strong>{preview.months.join("、")}</strong><span>覆盖月份</span></div>
              <div><strong>{preview.row_count}</strong><span>明细行</span></div>
              <div><strong>{preview.ticket_count}</strong><span>票号</span></div>
              <div><strong>{preview.terminal_count}</strong><span>终端</span></div>
              <div><strong>{preview.tag_count}</strong><span>命中标签</span></div>
              <div><strong>{preview.policy_count}</strong><span>参与政策</span></div>
              <div><strong>{preview.auto_customer_count}</strong><span>自动建档</span></div>
              <div><strong>{preview.negative_row_count}</strong><span>负数行（不打标）</span></div>
            </div>
            {preview.unknown_salespeople?.length ? (
              <Alert
                type="warning"
                showIcon
                content={`未识别业务员：${preview.unknown_salespeople.join("、")}。相关自动建档人员字段将留空。`}
              />
            ) : null}
            <div className="snow-tag-summary">
              {Object.keys(preview.tag_counts || {}).map((tag) => (
                <span key={tag}>
                  <span className="tag-neutral">{tag}</span>
                  <strong>{preview.tag_counts?.[tag] || 0}</strong>
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

export default SnowOutboundUploadModal;
