/**
 * 照片归档弹窗：选择政策标签并归档选中照片。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Alert, Message, Select } from "../../lib/arco.js";
import { FormModal } from "../../components/ui/FormModal.jsx";
import { archivePhotos, getArchiveOptions } from "../../api/photos.js";

const { Option } = Select;

export function ArchiveModal({
  visible,
  month,
  selectedIds,
  selectedTerminalCount,
  onClose,
  onArchived,
}) {
  const [archivePolicyId, setArchivePolicyId] = useState("");
  const [archiveOptions, setArchiveOptions] = useState([]);
  const [archiveOptionsLoading, setArchiveOptionsLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!visible || !selectedIds.length || !month) return;
    setArchivePolicyId("");
    setArchiveOptions([]);
    setArchiveOptionsLoading(true);
    getArchiveOptions(month)
      .then((result) => setArchiveOptions(result.items || []))
      .catch((error) => {
        Message.error(error.message);
        onClose();
      })
      .finally(() => setArchiveOptionsLoading(false));
  }, [visible, month, selectedIds]);

  async function submit() {
    if (!selectedIds.length || !archivePolicyId || !month) return;
    setArchiving(true);
    try {
      const result = await archivePhotos({
        image_ids: [...selectedIds],
        policy_id: archivePolicyId,
        month,
      });
      onClose();
      Message.success(
        `归档完成：新增${result.archived_count}张，重复跳过${result.skipped_count}张，涉及${result.terminal_count}家终端`
      );
      await onArchived?.();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <FormModal
      size="small"
      title="照片归档"
      visible={visible}
      loading={archiving}
      okDisabled={archiveOptionsLoading || !archivePolicyId}
      okText="归档"
      onCancel={() => !archiving && onClose()}
      onSubmit={submit}
      cancelButtonProps={{ disabled: archiving }}
      className="photo-archive-action-modal"
    >
      <div className="photo-archive-action-form">
        <div className="photo-archive-field">
          <label>
            归类标签 <span className="required-mark">*</span>
          </label>
          <Select
            value={archivePolicyId || undefined}
            placeholder={
              archiveOptionsLoading
                ? "正在读取当前月份政策标签"
                : "请选择一个已启用且需要拍照的雪花政策标签"
            }
            loading={archiveOptionsLoading}
            disabled={archiveOptionsLoading || !archiveOptions.length}
            onChange={(value) => setArchivePolicyId(value || "")}
          >
            {archiveOptions.map((policy) => (
              <Option key={policy.id} value={policy.id}>
                {policy.display_name}
              </Option>
            ))}
          </Select>
          {!archiveOptionsLoading && !archiveOptions.length ? (
            <Alert
              type="warning"
              showIcon
              content={`${month} 暂无已启用且需要拍照的雪花政策标签`}
            />
          ) : null}
        </div>
        <div className="photo-archive-selection-summary">
          <div>
            <span>本轮选择照片</span>
            <span className="tag-neutral numeric-tag">{selectedIds.length}</span>
            <em>张</em>
          </div>
          <div>
            <span>本轮选择终端</span>
            <span className="tag-neutral numeric-tag">{selectedTerminalCount}</span>
            <em>家</em>
          </div>
        </div>
      </div>
    </FormModal>
  );
}

export default ArchiveModal;
