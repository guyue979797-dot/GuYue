/**
 * 新增记录（提取历史）弹窗 + 报错信息弹窗。
 */
import React, { useEffect, useState } from "../../lib/react.js";
import { Button, Empty, Modal, Tag, Text } from "../../lib/arco.js";
import { TableText } from "../../components/ui/TableText.jsx";
import { getExtractionRecords } from "../../api/photos.js";
import { formatDateTime } from "../../utils/formatters.js";

export function ExtractionRecordsModal({ visible, refreshKey = 0, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function loadRecords() {
    setLoading(true);
    try {
      const result = await getExtractionRecords();
      setRecords(result.items || []);
    } catch (error) {
      setErrorText(error.message);
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) loadRecords();
  }, [visible]);

  useEffect(() => {
    if (visible && refreshKey > 0) loadRecords();
  }, [refreshKey]);

  return (
    <Modal
      title="新增记录"
      visible={visible}
      footer={null}
      onCancel={onClose}
      className="extraction-records-modal"
      unmountOnExit
    >
      <div className="export-record-toolbar">
        <Text type="secondary">记录保留30天，报错信息所有用户可查看</Text>
        <Button size="small" loading={loading} onClick={loadRecords}>
          刷新
        </Button>
      </div>
      {records.length ? (
        <div className="export-record-table-wrap">
          <table className="export-record-table extraction-record-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>方式</th>
                <th>状态</th>
                <th>照片数量</th>
                <th>终端数量</th>
                <th>报错信息</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const methodLabel =
                  record.method === "batch" ? "批量提取" : "单链接提取";
                const statusMap = {
                  processing: { label: "处理中", color: "blue" },
                  success: { label: "成功", color: "green" },
                  partial_success: { label: "部分成功", color: "gold" },
                  failed: { label: "失败", color: "red" },
                };
                const currentStatus =
                  statusMap[record.status] || {
                    label: record.status || "-",
                    color: "gray",
                  };
                return (
                  <tr key={record.id}>
                    <td>{formatDateTime(record.created_at)}</td>
                    <td>
                      <TableText
                        value={record.owner_display_name || record.owner_username}
                        maxWidth={140}
                      />
                    </td>
                    <td>{methodLabel}</td>
                    <td>
                      <Tag color={currentStatus.color}>
                        {currentStatus.label}
                      </Tag>
                    </td>
                    <td>{record.image_count} 张</td>
                    <td>{record.terminal_count} 个</td>
                    <td>
                      {record.error_information ? (
                        <Button
                          size="mini"
                          onClick={() => {
                            setErrorText(record.error_information);
                            setErrorOpen(true);
                          }}
                        >
                          查看报错
                        </Button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          description={loading ? "正在读取新增记录" : "暂无新增记录"}
        />
      )}
      <Modal
        title="报错信息"
        visible={errorOpen}
        footer={null}
        onCancel={() => setErrorOpen(false)}
        className="extraction-error-modal"
        unmountOnExit
      >
        <pre className="extraction-error-content">
          {errorText || "暂无报错信息"}
        </pre>
      </Modal>
    </Modal>
  );
}

export default ExtractionRecordsModal;
