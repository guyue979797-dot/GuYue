/**
 * CRM 图片处理页面入口。
 */
import React, { useState } from "../../lib/react.js";
import {
  Button,
  Card,
  Empty,
  Image,
  Message,
  Modal,
  Pagination,
  Space,
  Spin,
  Tabs,
  Text,
} from "../../lib/arco.js";
import { FilterBar } from "../../components/ui/FilterBar.jsx";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { TerminalListModal } from "../../components/business/TerminalListModal.jsx";
import { ImageArchiveBadges } from "../../components/business/ImageArchiveBadges.jsx";
import {
  copyText,
} from "../../utils/browser.js";
import {
  deleteArchiveTag,
  exportPhotoArchive,
  getPolicyMissing,
} from "../../api/photos.js";
import { BATCH_JOB_STORAGE_KEY } from "./constants.js";
import { usePhotoLibrary } from "./usePhotoLibrary.js";
import { FieldSummary } from "./FieldSummary.jsx";
import { SingleExtract } from "./SingleExtract.jsx";
import { BatchExtract } from "./BatchExtract.jsx";
import { ArchiveModal } from "./ArchiveModal.jsx";
import { PhotoArchiveModal } from "./PhotoArchiveModal.jsx";
import { ExtractionRecordsModal } from "./ExtractionRecordsModal.jsx";
import { ImagePreview } from "./ImagePreview.jsx";

const { TabPane } = Tabs;

export function PhotoLibraryPage({ activeMonth, onMonthsChange }) {
  const library = usePhotoLibrary({ activeMonth, onMonthsChange });
  const [missingFieldsCollapsed, setMissingFieldsCollapsed] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [photoArchiveOpen, setPhotoArchiveOpen] = useState(false);
  const [photoArchiveRefreshKey, setPhotoArchiveRefreshKey] = useState(0);
  const [archiveExportingId, setArchiveExportingId] = useState("");
  const [extractionRecordsOpen, setExtractionRecordsOpen] = useState(false);
  const [extractionRefreshKey, setExtractionRefreshKey] = useState(0);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingPolicy, setMissingPolicy] = useState(null);
  const [missingTerminals, setMissingTerminals] = useState([]);
  const [removeTagTarget, setRemoveTagTarget] = useState(null);
  const [removingTag, setRemovingTag] = useState(false);
  const [createOpen, setCreateOpen] = useState(
    () => Boolean(window.localStorage.getItem(BATCH_JOB_STORAGE_KEY)),
  );
  const [previewImage, setPreviewImage] = useState(null);

  const recoveringBatchJob = Boolean(
    window.localStorage.getItem(BATCH_JOB_STORAGE_KEY),
  );
  const hasFieldQuery = Boolean(library.queriedFields.trim());
  const missingFields = hasFieldQuery ? library.data.missing_fields || [] : [];
  const shouldShowMissingFields = missingFields.length > 0;
  const selectedTerminalCount = new Set(library.selectedImageFields.values()).size;

  function openPhotoArchive() {
    const month = activeMonth || library.data.months?.[0] || "";
    if (!month) {
      Message.warning("暂无可查看的照片月份");
      return;
    }
    setPhotoArchiveOpen(true);
  }

  async function openMissingTerminals(policy) {
    if (!policy.missing_count) return;
    setMissingPolicy(policy);
    setMissingTerminals([]);
    setMissingOpen(true);
    setMissingLoading(true);
    try {
      const result = await getPolicyMissing(policy.policy_id);
      setMissingTerminals(result.items || []);
    } catch (error) {
      Message.error(error.message);
      setMissingOpen(false);
    } finally {
      setMissingLoading(false);
    }
  }

  async function exportPolicyArchive(policy) {
    if (!policy.photo_count) return;
    setArchiveExportingId(policy.policy_id);
    try {
      await exportPhotoArchive(policy.policy_id);
      Message.success(`“${policy.display_name}”照片档案已导出`);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setArchiveExportingId("");
    }
  }

  async function removeArchiveTag() {
    if (!removeTagTarget) return;
    const { image, tag } = removeTagTarget;
    setRemovingTag(true);
    try {
      await deleteArchiveTag(image.id, tag.policy_id);
      setPreviewImage((current) =>
        current?.id === image.id
          ? {
              ...current,
              archive_tags: (current.archive_tags || []).filter(
                (item) => item.policy_id !== tag.policy_id
              ),
            }
          : current
      );
      setRemoveTagTarget(null);
      Message.success(`已删除照片标签“${tag.tag}”`);
      await library.refreshLibrary();
      if (photoArchiveOpen) setPhotoArchiveRefreshKey((key) => key + 1);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setRemovingTag(false);
    }
  }

  async function refreshAfterExtraction() {
    await library.refreshLibrary();
    if (extractionRecordsOpen) setExtractionRefreshKey((key) => key + 1);
  }

  async function copyMissingFields() {
    if (!missingFields.length) return;
    try {
      const copied = await copyText(missingFields.join("\n"));
      if (!copied) throw new Error("copy failed");
      library.setStatus({ type: "success", message: "已复制全部未找到终端编码" });
    } catch {
      library.setStatus({ type: "error", message: "复制失败，请手动选择标签内容" });
    }
  }

  const filterFields = [
    {
      name: "businesses",
      label: "业务",
      type: "multi-select",
      placeholder: "业务",
      options: library.data.businesses || [],
      maxTagCount: 1,
    },
    {
      name: "policyMatch",
      label: "终端政策条件",
      type: "select",
      group: "library-policy-group",
      placeholder: "终端政策条件",
      options: [
        { value: "include", label: "包含" },
        { value: "exclude", label: "不包含" },
      ],
    },
    {
      name: "policyIds",
      label: "雪花已出库政策",
      type: "multi-select",
      group: "library-policy-group",
      placeholder: "雪花已出库政策",
      options: library.data.policy_options || [],
    },
    {
      name: "archivePolicyMatch",
      label: "照片归档条件",
      type: "select",
      group: "library-archive-group",
      placeholder: "照片归档条件",
      options: [
        { value: "archived", label: "已归档" },
        { value: "unarchived", label: "未归档" },
      ],
    },
    {
      name: "archivePolicyIds",
      label: "政策标签",
      type: "multi-select",
      group: "library-archive-group",
      placeholder: "政策标签",
      options: library.data.archive_policy_options || [],
    },
    {
      name: "customerName",
      label: "客户名字",
      type: "select",
      placeholder: "客户名字",
      options: library.data.customer_names || [],
      showSearch: true,
      filterOption: (inputValue, option) =>
        String(option.props.children || "")
          .toLowerCase()
          .includes(String(inputValue || "").toLowerCase()),
    },
    {
      name: "fields",
      label: "批量终端编码",
      type: "input",
      placeholder: "批量终端编码",
    },
  ];

  return (
    <div className="crm-page">
      <Card bordered className="filter-module">
        <FilterBar
          fields={filterFields}
          values={{
            businesses: library.businesses,
            policyMatch: library.policyMatch,
            policyIds: library.policyIds,
            archivePolicyMatch: library.archivePolicyMatch,
            archivePolicyIds: library.archivePolicyIds,
            customerName: library.customerName,
            fields: library.fields,
          }}
          onChange={(nextValues) => {
            const keys = [
              "businesses",
              "policyMatch",
              "policyIds",
              "archivePolicyMatch",
              "archivePolicyIds",
              "customerName",
              "fields",
            ];
            keys.forEach((key) => {
              const next = nextValues[key];
              const current = library[key];
              const changed = Array.isArray(current)
                ? current.length !== (next || []).length
                : current !== next;
              if (changed) {
                const setters = {
                  businesses: library.setBusinesses,
                  policyMatch: library.setPolicyMatch,
                  policyIds: library.setPolicyIds,
                  archivePolicyMatch: library.setArchivePolicyMatch,
                  archivePolicyIds: library.setArchivePolicyIds,
                  customerName: library.setCustomerName,
                  fields: library.setFields,
                };
                setters[key]?.(next ?? (Array.isArray(current) ? [] : ""));
              }
            });
          }}
          onSearch={() => library.runSearch()}
          onReset={library.resetAllFilters}
          loading={library.loading}
          className="library-filter-bar"
        />
        {shouldShowMissingFields ? (
          <div className="query-result-panel">
            <div className="query-result-head">
              <div className="query-result-summary">
                <Text type="secondary">未找到</Text>
                <Text bold>{missingFields.length} 家</Text>
              </div>
              <Space size={8}>
                <Button size="small" type="secondary" onClick={copyMissingFields}>
                  复制全部
                </Button>
                <Button
                  size="small"
                  type="text"
                  aria-expanded={!missingFieldsCollapsed}
                  onClick={() => setMissingFieldsCollapsed((value) => !value)}
                >
                  {missingFieldsCollapsed ? "展开" : "收起"}
                  <span className="collapse-indicator" aria-hidden="true">
                    {missingFieldsCollapsed ? "⌄" : "⌃"}
                  </span>
                </Button>
              </Space>
            </div>
            {!missingFieldsCollapsed ? (
              <div className="query-tags query-result-tags">
                {missingFields.map((field) => (
                  <span key={field} className="tag-neutral">
                    {field}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card bordered className="crm-operation-module">
        <div className="operation-toolbar">
          <div className="business-action-group toolbar-primary-actions">
            <Button className="add-button" onClick={() => setCreateOpen(true)}>
              新增照片
            </Button>
            <Button onClick={() => setExtractionRecordsOpen(true)}>新增记录</Button>
          </div>
          <div className="selection-summary">
            <div className="selection-metric">
              <Text type="secondary">筛选出</Text>
              <span className="tag-neutral numeric-tag">
                {library.data.pagination?.total_groups || 0}
              </span>
              <Text type="secondary">家</Text>
            </div>
            <Text type="secondary" className="selection-separator">，</Text>
            <div className="selection-metric">
              <Text type="secondary">已选择照片</Text>
              <span className="tag-neutral numeric-tag">{library.selected.size}</span>
              <Text type="secondary">张</Text>
            </div>
            <Text type="secondary" className="selection-separator">，</Text>
            <div className="selection-metric">
              <Text type="secondary">终端</Text>
              <span className="tag-neutral numeric-tag">{selectedTerminalCount}</span>
              <Text type="secondary">家</Text>
            </div>
            <Button
              type="text"
              className="cancel-selection-button"
              disabled={!library.selected.size}
              onClick={library.clearSelection}
            >
              取消选择
            </Button>
          </div>
          <div className="business-action-group toolbar-archive-actions">
            <Button type="primary" disabled={!library.selected.size} onClick={() => setArchiveOpen(true)}>
              归档
            </Button>
            <Button onClick={openPhotoArchive}>照片档案</Button>
          </div>
        </div>
        <StatusAlert status={library.status} />
        <div className="library-content-shell">
          <div className="library-scroll-region" ref={library.libraryScrollRef}>
            {library.loading ? (
              <div className="library-loading-state" aria-label="正在加载图片结果">
                <Spin size={32} />
              </div>
            ) : !library.data.items?.length ? (
              <Empty description="没有查询到符合条件的图片" />
            ) : (
              <div className="library-list">
                {library.data.items.map((group, groupIndex) => {
                  const terminalIndex =
                    (library.data.pagination.page - 1) * library.data.pagination.page_size + groupIndex + 1;
                  return (
                    <Card
                      key={`${group.month}-${group.field}-${group.business}-${group.customer_name}`}
                      bordered
                      className="terminal-card"
                      title={
                        <FieldSummary
                          fields={[
                            { label: "序号", value: String(terminalIndex) },
                            { label: "终端编码", value: group.field },
                            { label: "客户名字", value: group.customer_name },
                            { label: "业务", value: group.business },
                          ]}
                          policyTags={group.policy_tags || []}
                        />
                      }
                      extra={
                        <span
                          className="group-image-count"
                          title={`该终端共 ${group.images.length} 张照片`}
                        >
                          {group.images.length} 张
                        </span>
                      }
                    >
                      <div className="responsive-image-grid library-grid">
                        {group.images.map((image) => {
                          const isSelected = library.selected.has(image.id);
                          return (
                            <div key={image.id}>
                              <Card
                                bordered
                                className={isSelected ? "image-card selected" : "image-card"}
                                bodyStyle={{ padding: 0 }}
                              >
                                <ImageArchiveBadges
                                  tags={image.archive_tags || []}
                                  onRemove={(tag) => setRemoveTagTarget({ image, tag })}
                                />
                                <Image
                                  src={image.thumbnail_url || image.url}
                                  width="100%"
                                  height="100%"
                                  fit="contain"
                                  loading="lazy"
                                  lazyload
                                  preview={false}
                                  onClick={() => setPreviewImage(image)}
                                />
                                <div className="image-actions">
                                  <Button
                                    type={isSelected ? "primary" : "secondary"}
                                    long
                                    onClick={() => library.toggleImage(image, group.field)}
                                  >
                                    {isSelected ? "已选中" : "选择"}
                                  </Button>
                                </div>
                              </Card>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            {library.data.pagination?.total_groups > 0 ? (
              <div className="library-pagination">
                <Pagination
                  current={library.data.pagination.page}
                  pageSize={library.data.pagination.page_size}
                  total={library.data.pagination.total_groups}
                  size="small"
                  disabled={library.loading}
                  onChange={library.changePage}
                />
              </div>
            ) : null}
          </div>
          {library.loading ? (
            <div className="library-loading-mask" aria-label="正在加载分页数据">
              <Spin size={32} />
            </div>
          ) : null}
        </div>
      </Card>

      <ArchiveModal
        visible={archiveOpen}
        month={activeMonth}
        selectedIds={[...library.selected]}
        selectedTerminalCount={selectedTerminalCount}
        onClose={() => setArchiveOpen(false)}
        onArchived={async () => {
          library.clearSelection();
          await library.refreshLibrary();
        }}
      />

      <PhotoArchiveModal
        visible={photoArchiveOpen}
        defaultMonth={activeMonth || library.data.months?.[0] || ""}
        refreshKey={photoArchiveRefreshKey}
        exportingPolicyId={archiveExportingId}
        onClose={() => setPhotoArchiveOpen(false)}
        onExport={exportPolicyArchive}
        onOpenMissing={openMissingTerminals}
      />

      <TerminalListModal
        visible={missingOpen}
        title={`缺失终端 · ${missingPolicy?.display_name || ""}`}
        terminals={missingTerminals}
        loading={missingLoading}
        summaryLabel="家未拍照终端"
        emptyText="暂无缺失终端"
        onClose={() => setMissingOpen(false)}
      />

      <ExtractionRecordsModal
        visible={extractionRecordsOpen}
        refreshKey={extractionRefreshKey}
        onClose={() => setExtractionRecordsOpen(false)}
      />

      <Modal
        title="新增"
        visible={createOpen}
        footer={null}
        onCancel={() => setCreateOpen(false)}
        className="create-modal"
        unmountOnExit
      >
        <Tabs defaultActiveTab={recoveringBatchJob ? "batch" : "single"}>
          <TabPane key="single" title="单链接提取">
            <SingleExtract onRefreshResults={refreshAfterExtraction} />
          </TabPane>
          <TabPane key="batch" title="批量提取">
            <BatchExtract onRefreshResults={refreshAfterExtraction} />
          </TabPane>
        </Tabs>
      </Modal>

      <Modal
        title="删除标签"
        visible={Boolean(removeTagTarget)}
        onCancel={() => {
          if (!removingTag) setRemoveTagTarget(null);
        }}
        onOk={removeArchiveTag}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ status: "danger", loading: removingTag }}
        className="image-tag-remove-modal"
        unmountOnExit
      >
        <p className="image-tag-remove-message">
          确定从此照片移除
          <strong>“{removeTagTarget?.tag?.tag || ""}”</strong>
          标签吗？
        </p>
      </Modal>

      <ImagePreview
        image={previewImage}
        onClose={() => setPreviewImage(null)}
        onRemoveTag={(tag) => setRemoveTagTarget({ image: previewImage, tag })}
      />
    </div>
  );
}

export default PhotoLibraryPage;
