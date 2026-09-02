/**
 * 照片档案弹窗：按月查看政策标签归档进度、缺失终端与导出。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Button, Empty, Modal, Pagination, Select, Spin, Tag, Text, Tooltip } from "../../lib/arco.js";
import { getPhotoArchivePolicies } from "../../api/photos.js";
import { formatCompactDateTime, formatDateTime } from "../../utils/formatters.js";

const { Option } = Select;

export function PhotoArchiveModal({
  visible,
  defaultMonth,
  refreshKey = 0,
  exportingPolicyId,
  onClose,
  onExport,
  onOpenMissing,
}) {
  const [month, setMonth] = useState("");
  const [months, setMonths] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  async function loadArchives({ nextMonth = month, nextPage = page, nextPageSize = pageSize } = {}) {
    if (!nextMonth) return;
    setLoading(true);
    try {
      const result = await getPhotoArchivePolicies({
        month: nextMonth,
        page: String(nextPage),
        page_size: String(nextPageSize),
      });
      setItems(result.items || []);
      setMonths(result.months || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
      setPageSize(result.page_size || nextPageSize);
    } catch (error) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    const initialMonth = defaultMonth || "";
    if (!initialMonth) return;
    setMonth(initialMonth);
    setPage(1);
    loadArchives({ nextMonth: initialMonth, nextPage: 1 });
  }, [visible, defaultMonth]);

  useEffect(() => {
    if (visible && refreshKey > 0 && month) {
      loadArchives();
    }
  }, [refreshKey]);

  function changeMonth(nextMonth) {
    setMonth(nextMonth);
    setPage(1);
    loadArchives({ nextMonth, nextPage: 1 });
  }

  return (
    <Modal
      title="照片档案"
      visible={visible}
      footer={null}
      onCancel={onClose}
      className="photo-archive-list-modal"
      unmountOnExit
    >
      <div className="photo-archive-toolbar">
        <div>
          <Select
            value={month || undefined}
            placeholder="选择月份"
            onChange={changeMonth}
          >
            {months.map((item) => (
              <Option key={item} value={item}>{item}</Option>
            ))}
          </Select>
          <Text type="secondary">共 {total} 个政策标签</Text>
        </div>
        <Button size="small" loading={loading} onClick={() => loadArchives()}>
          刷新
        </Button>
      </div>
      <div className="photo-archive-table-shell">
        {items.length ? (
          <div className="photo-archive-table-wrap">
            <table className="photo-archive-table">
              <thead>
                <tr>
                  <th>标签名</th>
                  <th>已出库</th>
                  <th>已拍照</th>
                  <th>缺失终端</th>
                  <th>照片总量</th>
                  <th>最近操作记录</th>
                  <th>导出</th>
                </tr>
              </thead>
              <tbody>
                {items.map((policy) => {
                  const operation = policy.latest_operation;
                  return (
                    <tr key={policy.policy_id}>
                      <td>
                        <span className="policy-name-tag">
                          {policy.display_name}
                        </span>
                      </td>
                      <td><strong>{policy.shipped_count}</strong></td>
                      <td><strong>{policy.photographed_count}</strong></td>
                      <td>
                        <Button
                          className={`data-link missing-terminal-button ${policy.missing_count ? "" : "policy-detail-number"}`.trim()}
                          type="text"
                          size="small"
                          disabled={!policy.missing_count}
                          aria-label={`查看 ${policy.display_name} 缺失终端`}
                          onClick={() => onOpenMissing(policy)}
                        >
                          {policy.missing_count}
                        </Button>
                      </td>
                      <td><strong>{policy.photo_count}</strong></td>
                      <td>
                        {operation ? (
                          <Tooltip
                            content={`${formatDateTime(operation.operated_at)} · ${operation.actor_name || "-"} · ${operation.action_label} · ${operation.photo_count}张照片`}
                            getPopupContainer={() => document.body}
                          >
                            <div className="photo-archive-operation">
                              <span>{formatCompactDateTime(operation.operated_at)}</span>
                              <span>{operation.actor_name || "-"}</span>
                              <Tag
                                color={
                                  operation.action_type === "archive"
                                    ? "arcoblue"
                                    : operation.action_type === "unarchive"
                                      ? "red"
                                      : "green"
                                }
                              >
                                {operation.action_label}
                              </Tag>
                            </div>
                          </Tooltip>
                        ) : (
                          <Text type="secondary">暂无记录</Text>
                        )}
                      </td>
                      <td>
                        <Button
                          type="text"
                          size="small"
                          loading={exportingPolicyId === policy.policy_id}
                          disabled={!policy.photo_count}
                          onClick={() => onExport(policy)}
                        >
                          导出
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            description={loading ? "正在读取照片档案" : "当前月份暂无政策标签"}
          />
        )}
        {loading ? (
          <div className="photo-archive-loading">
            <Spin size={28} />
          </div>
        ) : null}
      </div>
      <div className="photo-archive-pagination">
        <span>每页</span>
        <Select
          value={pageSize}
          onChange={(value) => {
            setPageSize(value);
            setPage(1);
            loadArchives({ nextPage: 1, nextPageSize: value });
          }}
        >
          {[10, 20, 50].map((size) => (
            <Option key={size} value={size}>{size} 条</Option>
          ))}
        </Select>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          size="small"
          onChange={(nextPage) => {
            setPage(nextPage);
            loadArchives({ nextPage });
          }}
        />
      </div>
    </Modal>
  );
}

export default PhotoArchiveModal;
