import "./styles.css";

const React = window.React;
const { useEffect, useRef, useState } = React;
const { createRoot } = window.ReactDOMClient;
const {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Empty,
  Image,
  Input,
  Layout,
  Message,
  Modal,
  Pagination,
  Progress,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tabs,
  Tooltip,
  Typography,
  Upload,
} = window.arco;

const { Header, Content, Sider } = Layout;
const { Text } = Typography;
const Option = Select.Option;
const TabPane = Tabs.TabPane;
const BATCH_JOB_STORAGE_KEY = "infolens.activeBatchJob";

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function latestCsrfToken(fallback = "") {
  try {
    const session = await jsonFetch("/api/session");
    return session.csrf_token || fallback;
  } catch (_error) {
    return fallback;
  }
}

function downloadFile(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadPostFile(url, csrfToken) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "下载失败");
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : plainMatch?.[1] || "照片档案.zip";
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  downloadFile(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function legacyCopyText(text) {
  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement;
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
    activeElement?.focus?.();
  }
  return copied;
}

async function copyText(text) {
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // HTTP deployments and restricted browser permissions require the fallback below.
    }
  }
  return legacyCopyText(text);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCompactDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getDateParts(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function Status({ status }) {
  if (!status?.message) return null;
  return (
    <Alert
      className="status-alert"
      type={status.type || "info"}
      content={status.message}
      showIcon
    />
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <rect className="mark-bg" x="5" y="5" width="54" height="54" rx="16" />
        <path className="mark-mountain" d="M12 35 24 21l8 9 7-7 13 12" />
        <path className="mark-road" d="M13 43c7-4 14-5 22-3 6 1.5 10 1 16-2" />
        <path className="mark-bottle" d="M41 18h7v6l3 5v12a5 5 0 0 1-5 5 5 5 0 0 1-5-5V29l3-5v-6Z" />
        <path className="mark-cap" d="M41 15h7" />
        <path className="mark-label" d="M42 33h8" />
        <text className="mark-text" x="13" y="52">XXC</text>
      </svg>
    </div>
  );
}

function NavIcon({ type }) {
  if (type === "customers") {
    return (
      <span className="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 4h14v16H5z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </span>
    );
  }
  if (type === "users") {
    return (
      <span className="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
          <path d="M16 10a2.5 2.5 0 1 0 0-5" />
          <path d="M15 14.5a4 4 0 0 1 5.5 3.8" />
        </svg>
      </span>
    );
  }
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M7.5 7.5 9 5h6l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z" />
        <path d="M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M18 10h.01" />
      </svg>
    </span>
  );
}

function EmptyBox({ text }) {
  return (
    <div className="empty-box">
      <Empty description={text} />
    </div>
  );
}

function FieldSummary({ fields, policyTags = [] }) {
  return (
    <div className="field-summary">
      {fields.map((field) => (
        <div className="field-item" key={field.label}>
          <Text className="field-label">{field.label}：</Text>
          <span className="field-value" title={field.value || "-"}>
            {field.value || "-"}
          </span>
        </div>
      ))}
      {policyTags.length ? (
        <div className="field-item field-policy-item">
          <Text className="field-label">政策标签：</Text>
          <div className="field-policy-tags">
            {policyTags.map((policy) => (
              <Tag
                key={policy.policy_id || policy.tag}
                color={policy.color || "arcoblue"}
              >
                {policy.tag}
              </Tag>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableEllipsis({
  value,
  children,
  className = "",
  maxWidth = 180,
  tooltip,
}) {
  const normalized = value == null || value === "" ? "-" : String(value);
  const tooltipContent = tooltip || normalized;
  return (
    <Tooltip content={tooltipContent} disabled={!tooltipContent || tooltipContent === "-"}>
      <span
        className={`table-ellipsis ${className}`.trim()}
        style={{ maxWidth }}
      >
        {children ?? normalized}
      </span>
    </Tooltip>
  );
}

function TablePolicyTags({ tags = [], limit = 2 }) {
  if (!tags.length) return "-";
  const visible = tags.slice(0, limit);
  const hiddenCount = tags.length - visible.length;
  const content = (
    <div className="table-policy-tooltip">
      {tags.map((tag) => (
        <span
          className={`policy-tag ${policyColorClass(tag.color)}`}
          key={`${tag.policy_id}-${tag.name}`}
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
  return (
    <Tooltip content={content}>
      <span className="policy-tags-cell policy-tags-cell-compact">
        {visible.map((tag) => (
          <span
            className={`policy-tag ${policyColorClass(tag.color)}`}
            key={`${tag.policy_id}-${tag.name}`}
          >
            {tag.name}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="table-tag-more">+{hiddenCount}</span>
        ) : null}
      </span>
    </Tooltip>
  );
}

function ImageArchiveBadges({ tags = [], expanded = false, onRemove }) {
  const seen = new Set();
  const normalized = tags.filter((tag) => {
    const key = tag.policy_id || tag.tag;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!normalized.length) return null;

  const content = (
    <div className="image-archive-tooltip">
      <strong>归档标签</strong>
      <div>
        {normalized.map((tag) => (
          <Tag key={tag.policy_id || tag.tag} color={tag.color || "arcoblue"}>
            {tag.tag}
          </Tag>
        ))}
      </div>
    </div>
  );

  return (
    <Tooltip content={content} position="top">
      <div
        className={
          expanded
            ? "image-archive-badges image-archive-badges-expanded"
            : "image-archive-badges"
        }
        aria-label={`归档标签：${normalized.map((tag) => tag.tag).join("、")}`}
        onClick={(event) => event.stopPropagation()}
      >
        {normalized.map((tag) => (
          <Tag
            key={tag.policy_id || tag.tag}
            color={tag.color || "arcoblue"}
            className="image-archive-badge"
          >
            <span className="image-archive-badge-label">{tag.tag}</span>
            {onRemove ? (
              <button
                className="image-archive-remove"
                type="button"
                title={`删除标签“${tag.tag}”`}
                aria-label={`删除标签“${tag.tag}”`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(tag);
                }}
              >
                ×
              </button>
            ) : null}
          </Tag>
        ))}
      </div>
    </Tooltip>
  );
}

function TerminalListModal({
  visible,
  title,
  terminals = [],
  loading = false,
  summaryLabel = "家终端",
  emptyText = "暂无终端",
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
      className="missing-terminals-modal"
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
            <thead>
              <tr>
                <th>终端编码</th>
                <th>客户全名</th>
                <th>业务员</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((terminal) => (
                <tr key={terminal.terminal_code}>
                  <td><code>{terminal.terminal_code}</code></td>
                  <td>
                    <TableEllipsis
                      value={terminal.customer_name}
                      className="missing-customer-name"
                      maxWidth="100%"
                    />
                  </td>
                  <td>
                    <TableEllipsis
                      value={terminal.salesperson}
                      maxWidth={90}
                    />
                  </td>
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

function SingleExtract({ csrfToken, onRefreshResults }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const canSubmit = Boolean(url.trim()) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setStatus({ type: "info", message: "正在读取拜访信息并下载图片，请稍候" });
    try {
      const token = await latestCsrfToken(csrfToken);
      const data = await jsonFetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ url: url.trim(), csrf_token: token }),
      });
      setUrl("");
      setStatus({ type: "success", message: `完成：已提取 ${data.images.length} 张图片` });
      await onRefreshResults();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="extract-pane">
      <div className="extract-input-group">
        <Input
          size="large"
          value={url}
          placeholder="链接"
          onChange={setUrl}
          onPressEnter={submit}
        />
        <Button size="large" type="primary" loading={busy} disabled={!canSubmit} onClick={submit}>
          提取
        </Button>
      </div>
      <Status status={status} />
    </div>
  );
}

function BatchExtract({ csrfToken, onRefreshResults }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState(null);

  function selectFile(nextFile) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setStatus({ type: "error", message: "请选择有效的 .xlsx 文件" });
      return;
    }
    setFile(nextFile);
    setProgress(null);
    setStatus(null);
  }

  async function waitForJob(jobId, initialJob) {
    let job = initialJob;
    while (true) {
      setProgress(job);
      if (job.status === "completed") {
        window.localStorage.removeItem(BATCH_JOB_STORAGE_KEY);
        return job.result;
      }
      if (job.status === "failed") {
        window.localStorage.removeItem(BATCH_JOB_STORAGE_KEY);
        throw new Error(job.error || "批量提取失败");
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
      job = await jsonFetch(`/api/batch-extract/${encodeURIComponent(jobId)}`);
    }
  }

  useEffect(() => {
    const jobId = window.localStorage.getItem(BATCH_JOB_STORAGE_KEY);
    if (!jobId) return undefined;
    let active = true;
    setBusy(true);
    setStatus({ type: "info", message: "正在恢复批量任务" });
    (async () => {
      try {
        const initialJob = await jsonFetch(
          `/api/batch-extract/${encodeURIComponent(jobId)}`,
        );
        const data = await waitForJob(jobId, initialJob);
        if (!active) return;
        setStatus({
          type: "success",
          message: `完成：${data.succeeded}/${data.total}，${data.image_count} 张，重试 ${data.retry_count || 0} 次`,
        });
        await onRefreshResults();
      } catch (error) {
        if (!active) return;
        if (String(error.message).includes("不存在或已过期")) {
          window.localStorage.removeItem(BATCH_JOB_STORAGE_KEY);
        }
        setStatus({ type: "error", message: error.message });
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setStatus({ type: "info", message: "处理中" });
    try {
      const token = await latestCsrfToken(csrfToken);
      const form = new FormData();
      form.append("file", file);
      form.append("csrf_token", token);
      const started = await jsonFetch("/api/batch-extract", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        body: form,
      });
      window.localStorage.setItem(BATCH_JOB_STORAGE_KEY, started.job_id);
      const data = await waitForJob(started.job_id, started);
      setStatus({
        type: "success",
        message: `完成：${data.succeeded}/${data.total}，${data.image_count} 张，重试 ${data.retry_count || 0} 次`,
      });
      await onRefreshResults();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const percent = progress?.total ? Math.round((Number(progress.processed || 0) / Number(progress.total)) * 100) : 0;
  const pendingCount = Math.max(
    0,
    Number(progress?.total || 0) - Number(progress?.processed || 0),
  );
  const batchStats = [
    { label: "链接数", value: Number(progress?.input_count || progress?.total || 0) },
    { label: "重复/无效数", value: Number(progress?.rejected_count || 0) },
    { label: "待提取数", value: pendingCount },
    { label: "失败数", value: Number(progress?.failed || 0), danger: true },
  ];

  return (
    <div className="extract-pane">
      <Upload
        drag
        limit={1}
        autoUpload={false}
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fileList={file ? [{ uid: file.name, name: file.name }] : []}
        onChange={(_, currentFile) => selectFile(currentFile?.originFile || currentFile)}
        onDrop={(event) => selectFile(event.dataTransfer.files?.[0])}
      />
      <Space className="form-actions">
        <Button type="primary" loading={busy} disabled={!file} onClick={submit}>
          提取
        </Button>
      </Space>
      <Status status={status} />
      {progress ? (
        <Card className="sub-card" bordered>
          <div className="batch-stats" aria-label="批量提取统计">
            {batchStats.map((item) => (
              <div className="batch-stat" key={item.label}>
                <Text type="secondary">{item.label}</Text>
                <strong className={item.danger && item.value > 0 ? "is-danger" : ""}>
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
          <div className="progress-head">
            <Text>
              已处理 {progress.processed || 0}/{progress.total || 0} 条 · 成功 {progress.succeeded || 0} · 失败 {progress.failed || 0}
            </Text>
            <Text type="secondary">
              {progress.status === "queued" ? "排队中" : "处理中"} · 分段 {progress.chunk_index || 1}/{progress.chunk_count || 1} · 重试 {progress.retry_count || 0} 次
              {progress.resumed ? " · 已恢复" : ""}
            </Text>
          </div>
          <Progress percent={percent} />
        </Card>
      ) : null}
    </div>
  );
}

function ImageLibrary({ csrfToken, activeMonth, onMonthsChange }) {
  const [businesses, setBusinesses] = useState([]);
  const [fields, setFields] = useState("");
  const [queriedFields, setQueriedFields] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [policyIds, setPolicyIds] = useState([]);
  const [policyMatch, setPolicyMatch] = useState("include");
  const [archivePolicyIds, setArchivePolicyIds] = useState([]);
  const [archivePolicyMatch, setArchivePolicyMatch] = useState("archived");
  const [data, setData] = useState({
    items: [],
    months: [],
    businesses: [],
    customer_names: [],
    policy_options: [],
    archive_policy_options: [],
    field_count: 0,
    image_count: 0,
    missing_fields: [],
    pagination: {
      page: 1,
      page_size: 12,
      total_groups: 0,
      total_pages: 1,
      has_previous: false,
      has_next: false,
    },
  });
  const [selected, setSelected] = useState(new Set());
  const [selectedImageFields, setSelectedImageFields] = useState(new Map());
  const [missingFieldsCollapsed, setMissingFieldsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveOptions, setArchiveOptions] = useState([]);
  const [archivePolicyId, setArchivePolicyId] = useState("");
  const [archiveOptionsLoading, setArchiveOptionsLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [photoArchiveOpen, setPhotoArchiveOpen] = useState(false);
  const [photoArchiveMonth, setPhotoArchiveMonth] = useState("");
  const [photoArchiveMonths, setPhotoArchiveMonths] = useState([]);
  const [photoArchiveItems, setPhotoArchiveItems] = useState([]);
  const [photoArchiveTotal, setPhotoArchiveTotal] = useState(0);
  const [photoArchivePage, setPhotoArchivePage] = useState(1);
  const [photoArchivePageSize, setPhotoArchivePageSize] = useState(20);
  const [photoArchiveLoading, setPhotoArchiveLoading] = useState(false);
  const [archiveExportingId, setArchiveExportingId] = useState("");
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingPolicy, setMissingPolicy] = useState(null);
  const [missingTerminals, setMissingTerminals] = useState([]);
  const [extractionRecordsOpen, setExtractionRecordsOpen] = useState(false);
  const [extractionRecordsLoading, setExtractionRecordsLoading] = useState(false);
  const [extractionRecords, setExtractionRecords] = useState([]);
  const [extractionErrorOpen, setExtractionErrorOpen] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [removeTagTarget, setRemoveTagTarget] = useState(null);
  const [removingTag, setRemovingTag] = useState(false);
  const [createOpen, setCreateOpen] = useState(
    () => Boolean(window.localStorage.getItem(BATCH_JOB_STORAGE_KEY)),
  );
  const recoveringBatchJob = Boolean(
    window.localStorage.getItem(BATCH_JOB_STORAGE_KEY),
  );
  const [previewImage, setPreviewImage] = useState(null);
  const libraryScrollRef = useRef(null);
  const libraryCacheRef = useRef(new Map());
  const loadRequestRef = useRef(0);

  function libraryCacheKey(query) {
    return JSON.stringify([
      query.month,
      query.businesses,
      query.fields.trim(),
      query.customerName.trim(),
      query.policyIds,
      query.policyMatch,
      query.archivePolicyIds,
      query.archivePolicyMatch,
      query.page,
      query.pageSize,
    ]);
  }

  async function requestLibrary(query, { force = false } = {}) {
    const key = libraryCacheKey(query);
    if (!force && libraryCacheRef.current.has(key)) {
      return libraryCacheRef.current.get(key);
    }
    const next = await jsonFetch("/api/image-library/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: query.month,
        businesses: query.businesses,
        fields: query.fields,
        customer_name: query.customerName,
        policy_ids: query.policyIds,
        policy_match: query.policyMatch,
        archive_policy_ids: query.archivePolicyIds,
        archive_policy_match: query.archivePolicyMatch,
        page: query.page,
        page_size: query.pageSize,
      }),
    });
    if (libraryCacheRef.current.size >= 24) {
      libraryCacheRef.current.delete(libraryCacheRef.current.keys().next().value);
    }
    libraryCacheRef.current.set(key, next);
    return next;
  }

  function prefetchAdjacentPages(query, response) {
    const pages = [query.page - 1, query.page + 1].filter(
      (page) => page >= 1 && page <= response.pagination.total_pages,
    );
    if (!pages.length) return;
    const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 200));
    schedule(() => {
      pages.forEach((page) => {
        requestLibrary({ ...query, page }).catch(() => undefined);
      });
    });
  }

  async function load(overrides = {}) {
    const query = {
      month: overrides.month ?? activeMonth,
      businesses: overrides.businesses ?? businesses,
      fields: overrides.fields ?? fields,
      customerName: overrides.customerName ?? customerName,
      policyIds: overrides.policyIds ?? policyIds,
      policyMatch: overrides.policyMatch ?? policyMatch,
      archivePolicyIds: overrides.archivePolicyIds ?? archivePolicyIds,
      archivePolicyMatch: overrides.archivePolicyMatch ?? archivePolicyMatch,
      page: overrides.page ?? data.pagination?.page ?? 1,
      pageSize: overrides.pageSize ?? data.pagination?.page_size ?? 12,
    };
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const next = await requestLibrary(query, { force: Boolean(overrides.force) });
      if (requestId !== loadRequestRef.current) return null;
      setData(next);
      onMonthsChange?.(next.months || []);
      setQueriedFields(query.fields);
      setStatus(null);
      prefetchAdjacentPages(query, next);
      return next;
    } catch (error) {
      if (requestId === loadRequestRef.current) {
        setStatus({ type: "error", message: error.message });
      }
      return null;
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }

  function runSearch(overrides = {}) {
    setSelected(new Set());
    setSelectedImageFields(new Map());
    setMissingFieldsCollapsed(false);
    libraryCacheRef.current.clear();
    return load({ ...overrides, page: 1, force: true });
  }

  useEffect(() => {
    setSelected(new Set());
    setSelectedImageFields(new Map());
    setMissingFieldsCollapsed(false);
    setArchiveOpen(false);
    setArchivePolicyId("");
    setPhotoArchiveOpen(false);
    setMissingOpen(false);
    setBusinesses([]);
    setPolicyIds([]);
    setPolicyMatch("include");
    setArchivePolicyIds([]);
    setArchivePolicyMatch("archived");
    libraryCacheRef.current.clear();
    load({
      month: activeMonth || "",
      businesses: [],
      policyIds: [],
      policyMatch: "include",
      archivePolicyIds: [],
      archivePolicyMatch: "archived",
      page: 1,
      force: true,
    });
  }, [activeMonth]);

  useEffect(() => {
    if (!previewImage) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPreviewImage(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  function toggleImage(image, field) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(image.id)) next.delete(image.id);
      else next.add(image.id);
      return next;
    });
    setSelectedImageFields((current) => {
      const next = new Map(current);
      if (next.has(image.id)) next.delete(image.id);
      else next.set(image.id, field);
      return next;
    });
  }

  async function openArchive() {
    if (!selected.size || !activeMonth) return;
    setArchiveOpen(true);
    setArchivePolicyId("");
    setArchiveOptions([]);
    setArchiveOptionsLoading(true);
    try {
      const result = await jsonFetch(
        `/api/photo-archive/options?month=${encodeURIComponent(activeMonth)}`
      );
      setArchiveOptions(result.items || []);
    } catch (error) {
      Message.error(error.message);
      setArchiveOpen(false);
    } finally {
      setArchiveOptionsLoading(false);
    }
  }

  async function archiveSelected() {
    if (!selected.size || !archivePolicyId || !activeMonth) return;
    setArchiving(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const result = await jsonFetch("/api/photo-archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          image_ids: [...selected],
          policy_id: archivePolicyId,
          month: activeMonth,
          csrf_token: token,
        }),
      });
      setArchiveOpen(false);
      setArchivePolicyId("");
      setSelected(new Set());
      setSelectedImageFields(new Map());
      Message.success(
        `归档完成：新增${result.archived_count}张，重复跳过${result.skipped_count}张，涉及${result.terminal_count}家终端`
      );
      await refreshLibrary();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setArchiving(false);
    }
  }

  async function loadPhotoArchives({
    month = photoArchiveMonth,
    page = photoArchivePage,
    pageSize = photoArchivePageSize,
  } = {}) {
    if (!month) return;
    setPhotoArchiveLoading(true);
    try {
      const params = new URLSearchParams({
        month,
        page: String(page),
        page_size: String(pageSize),
      });
      const result = await jsonFetch(`/api/photo-archive/policies?${params}`);
      setPhotoArchiveItems(result.items || []);
      setPhotoArchiveMonths(result.months || []);
      setPhotoArchiveTotal(result.total || 0);
      setPhotoArchivePage(result.page || page);
      setPhotoArchivePageSize(result.page_size || pageSize);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setPhotoArchiveLoading(false);
    }
  }

  async function openPhotoArchive() {
    const month = activeMonth || data.months?.[0] || "";
    if (!month) {
      Message.warning("暂无可查看的照片月份");
      return;
    }
    setPhotoArchiveMonth(month);
    setPhotoArchivePage(1);
    setPhotoArchiveOpen(true);
    await loadPhotoArchives({ month, page: 1, pageSize: photoArchivePageSize });
  }

  async function changePhotoArchiveMonth(month) {
    setPhotoArchiveMonth(month);
    setPhotoArchivePage(1);
    await loadPhotoArchives({ month, page: 1, pageSize: photoArchivePageSize });
  }

  async function openMissingTerminals(policy) {
    if (!policy.missing_count) return;
    setMissingPolicy(policy);
    setMissingTerminals([]);
    setMissingOpen(true);
    setMissingLoading(true);
    try {
      const result = await jsonFetch(
        `/api/photo-archive/policies/${encodeURIComponent(policy.policy_id)}/missing`
      );
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
      const token = await latestCsrfToken(csrfToken);
      await downloadPostFile(
        `/api/photo-archive/policies/${encodeURIComponent(policy.policy_id)}/export`,
        token
      );
      Message.success(`“${policy.display_name}”照片档案已导出`);
      await loadPhotoArchives();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setArchiveExportingId("");
    }
  }

  async function loadExtractionRecords() {
    setExtractionRecordsLoading(true);
    try {
      const result = await jsonFetch("/api/extraction-records");
      setExtractionRecords(result.items || []);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setExtractionRecordsLoading(false);
    }
  }

  async function openExtractionRecords() {
    setExtractionRecordsOpen(true);
    await loadExtractionRecords();
  }

  function openExtractionError(message) {
    setExtractionError(message || "");
    setExtractionErrorOpen(true);
  }

  async function changePage(page) {
    if (loading || page === data.pagination.page) return;
    const next = await load({ page });
    if (!next) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        libraryScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    });
  }

  function refreshLibrary() {
    libraryCacheRef.current.clear();
    return load({ force: true });
  }

  function confirmRemoveArchiveTag(image, tag) {
    setRemoveTagTarget({ image, tag });
  }

  async function removeArchiveTag() {
    if (!removeTagTarget) return;
    const { image, tag } = removeTagTarget;
    setRemovingTag(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      await jsonFetch(
        `/api/photo-archive/images/${encodeURIComponent(image.id)}/policies/${encodeURIComponent(tag.policy_id)}`,
        {
          method: "DELETE",
          headers: { "X-CSRF-Token": token },
        }
      );
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
      await refreshLibrary();
      if (photoArchiveOpen) await loadPhotoArchives();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setRemovingTag(false);
    }
  }

  async function refreshAfterExtraction() {
    await refreshLibrary();
    if (extractionRecordsOpen) await loadExtractionRecords();
  }

  async function copyMissingFields() {
    if (!missingFields.length) return;
    try {
      const copied = await copyText(missingFields.join("\n"));
      if (!copied) throw new Error("copy failed");
      setStatus({ type: "success", message: "已复制全部未找到终端编码" });
    } catch {
      setStatus({ type: "error", message: "复制失败，请手动选择标签内容" });
    }
  }

  const hasFieldQuery = Boolean(queriedFields.trim());
  const missingFields = hasFieldQuery ? data.missing_fields || [] : [];
  const shouldShowMissingFields = missingFields.length > 0;
  const selectedTerminalCount = new Set(selectedImageFields.values()).size;

  return (
    <div className="crm-page">
      <div className="crm-header-layout">
        <Card bordered className="filter-module">
          <div className="filter-grid">
            <Select
              mode="multiple"
              placeholder="业务"
              value={businesses}
              allowClear
              maxTagCount={1}
              onChange={(value) => setBusinesses(value || [])}
            >
              {(data.businesses || []).map((value) => (
                <Option key={value} value={value}>
                  {value}
                </Option>
              ))}
            </Select>
            <div className="policy-filter-condition snow-policy-filter">
              <Select
                value={policyMatch}
                aria-label="终端政策条件"
                onChange={(value) => setPolicyMatch(value || "include")}
              >
                <Option value="include">包含</Option>
                <Option value="exclude">不包含</Option>
              </Select>
              <Select
                placeholder="雪花已出库政策"
                mode="multiple"
                value={policyIds}
                allowClear
                onChange={(value) => setPolicyIds(value || [])}
              >
                {(data.policy_options || []).map((policy) => (
                  <Option key={policy.id} value={policy.id}>
                    {policy.display_name}
                  </Option>
                ))}
              </Select>
            </div>
            <div className="policy-filter-condition archive-policy-filter">
              <Select
                value={archivePolicyMatch}
                aria-label="照片归档条件"
                onChange={(value) =>
                  setArchivePolicyMatch(value || "archived")
                }
              >
                <Option value="archived">已归档</Option>
                <Option value="unarchived">未归档</Option>
              </Select>
              <Select
                placeholder="政策标签"
                mode="multiple"
                value={archivePolicyIds}
                allowClear
                onChange={(value) => setArchivePolicyIds(value || [])}
              >
                {(data.archive_policy_options || []).map((policy) => (
                  <Option key={policy.id} value={policy.id}>
                    {policy.display_name}
                  </Option>
                ))}
              </Select>
            </div>
            <Input
              className="terminal-code-filter"
              value={fields}
              onChange={setFields}
              placeholder="批量终端编码"
              onPressEnter={() => runSearch()}
            />
            <Select
              className="customer-name-filter"
              placeholder="客户名字"
              value={customerName || undefined}
              allowClear
              showSearch
              filterOption={(inputValue, option) =>
                String(option.props.children || "")
                  .toLowerCase()
                  .includes(String(inputValue || "").toLowerCase())
              }
              onChange={(value) => setCustomerName(value || "")}
            >
              {(data.customer_names || []).map((value) => (
                <Option key={value} value={value}>
                  {value}
                </Option>
              ))}
            </Select>
            <div className="filter-actions">
              <Button type="primary" loading={loading} onClick={() => runSearch()}>
                查询
              </Button>
              <Button
                onClick={() => {
                  setBusinesses([]);
                  setFields("");
                  setCustomerName("");
                  setPolicyIds([]);
                  setPolicyMatch("include");
                  setArchivePolicyIds([]);
                  setArchivePolicyMatch("archived");
                  runSearch({
                    businesses: [],
                    fields: "",
                    customerName: "",
                    policyIds: [],
                    policyMatch: "include",
                    archivePolicyIds: [],
                    archivePolicyMatch: "archived",
                  });
                }}
              >
                清空
              </Button>
            </div>
          </div>
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
                    <Tag key={field} color="orangered">
                      {field}
                    </Tag>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <Card bordered className="crm-operation-module">
        <div className="operation-toolbar">
          <div className="business-action-group toolbar-primary-actions">
            <Button className="add-button" onClick={() => setCreateOpen(true)}>
              新增照片
            </Button>
            <Button onClick={openExtractionRecords}>新增记录</Button>
          </div>
          <div className="selection-summary">
            <div className="selection-metric">
              <Text type="secondary">筛选出</Text>
              <Tag color="arcoblue">
                {data.pagination?.total_groups || 0}
              </Tag>
              <Text type="secondary">家</Text>
            </div>
            <Text type="secondary" className="selection-separator">
              ，
            </Text>
            <div className="selection-metric">
              <Text type="secondary">已选择照片</Text>
              <Tag color="arcoblue">{selected.size}</Tag>
              <Text type="secondary">张</Text>
            </div>
            <Text type="secondary" className="selection-separator">
              ，
            </Text>
            <div className="selection-metric">
              <Text type="secondary">终端</Text>
              <Tag color="arcoblue">{selectedTerminalCount}</Tag>
              <Text type="secondary">家</Text>
            </div>
            <Button
              type="text"
              className="cancel-selection-button"
              disabled={!selected.size}
              onClick={() => {
                setSelected(new Set());
                setSelectedImageFields(new Map());
              }}
            >
              取消选择
            </Button>
          </div>
          <div className="business-action-group toolbar-archive-actions">
            <Button type="primary" disabled={!selected.size} onClick={openArchive}>
              归档
            </Button>
            <Button onClick={openPhotoArchive}>照片档案</Button>
          </div>
        </div>
        <Status status={status} />
        <div className="library-content-shell">
          <div className="library-scroll-region" ref={libraryScrollRef}>
            {!data.items?.length ? (
              <EmptyBox text="没有查询到符合条件的图片" />
            ) : (
              <div className="library-list">
                {data.items.map((group, groupIndex) => {
                const terminalIndex =
                  (data.pagination.page - 1) * data.pagination.page_size + groupIndex + 1;
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
                        const isSelected = selected.has(image.id);
                        return (
                          <div key={image.id}>
                            <Card
                              bordered
                              className={isSelected ? "image-card selected" : "image-card"}
                              bodyStyle={{ padding: 0 }}
                            >
                              <ImageArchiveBadges
                                tags={image.archive_tags || []}
                                onRemove={(tag) => confirmRemoveArchiveTag(image, tag)}
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
                                  onClick={() => toggleImage(image, group.field)}
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
            {data.pagination?.total_groups > 0 ? (
              <div className="library-pagination">
                <Pagination
                  current={data.pagination.page}
                  pageSize={data.pagination.page_size}
                  total={data.pagination.total_groups}
                  size="small"
                  disabled={loading}
                  onChange={changePage}
                />
              </div>
            ) : null}
          </div>
          {loading ? (
            <div className="library-loading-mask" aria-label="正在加载分页数据">
              <Spin size={32} />
            </div>
          ) : null}
        </div>
      </Card>

      <Modal
        title="照片归档"
        visible={archiveOpen}
        onCancel={() => !archiving && setArchiveOpen(false)}
        onOk={archiveSelected}
        okText="归档"
        cancelText="取消"
        okButtonProps={{
          loading: archiving,
          disabled: archiveOptionsLoading || !archivePolicyId,
        }}
        cancelButtonProps={{ disabled: archiving }}
        className="photo-archive-action-modal"
        unmountOnExit
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
                content={`${activeMonth} 暂无已启用且需要拍照的雪花政策标签`}
              />
            ) : null}
          </div>
          <div className="photo-archive-selection-summary">
            <div>
              <span>本轮选择照片</span>
              <Tag color="arcoblue">{selected.size}</Tag>
              <em>张</em>
            </div>
            <div>
              <span>本轮选择终端</span>
              <Tag color="arcoblue">{selectedTerminalCount}</Tag>
              <em>家</em>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title="照片档案"
        visible={photoArchiveOpen}
        footer={null}
        onCancel={() => setPhotoArchiveOpen(false)}
        className="photo-archive-list-modal"
        unmountOnExit
      >
        <div className="photo-archive-toolbar">
          <div>
            <Select
              value={photoArchiveMonth || undefined}
              placeholder="选择月份"
              onChange={changePhotoArchiveMonth}
            >
              {photoArchiveMonths.map((month) => (
                <Option key={month} value={month}>
                  {month}
                </Option>
              ))}
            </Select>
            <Text type="secondary">共 {photoArchiveTotal} 个政策标签</Text>
          </div>
          <Button
            size="small"
            loading={photoArchiveLoading}
            onClick={() => loadPhotoArchives()}
          >
            刷新
          </Button>
        </div>
        <div className="photo-archive-table-shell">
          {photoArchiveItems.length ? (
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
                {photoArchiveItems.map((policy) => {
                  const operation = policy.latest_operation;
                  return (
                    <tr key={policy.policy_id}>
                      <td>
                        <TableEllipsis
                          value={policy.display_name}
                          maxWidth={150}
                        >
                          <Tag color={policy.color || "arcoblue"}>
                            {policy.display_name}
                          </Tag>
                        </TableEllipsis>
                      </td>
                      <td><strong>{policy.shipped_count}</strong></td>
                      <td><strong>{policy.photographed_count}</strong></td>
                      <td>
                        <Button
                          className="missing-terminal-button"
                          type="text"
                          size="small"
                          disabled={!policy.missing_count}
                          onClick={() => openMissingTerminals(policy)}
                        >
                          {policy.missing_count}
                        </Button>
                      </td>
                      <td><strong>{policy.photo_count}</strong></td>
                      <td>
                        {operation ? (
                          <Tooltip
                            content={`${formatDateTime(operation.operated_at)} · ${operation.actor_name || "-"} · ${operation.action_label} · ${operation.photo_count}张照片`}
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
                          loading={archiveExportingId === policy.policy_id}
                          disabled={!policy.photo_count}
                          onClick={() => exportPolicyArchive(policy)}
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
            <EmptyBox
              text={photoArchiveLoading ? "正在读取照片档案" : "当前月份暂无政策标签"}
            />
          )}
          {photoArchiveLoading ? (
            <div className="photo-archive-loading">
              <Spin size={28} />
            </div>
          ) : null}
        </div>
        <div className="photo-archive-pagination">
          <span>每页</span>
          <Select
            value={photoArchivePageSize}
            onChange={(value) => {
              setPhotoArchivePageSize(value);
              setPhotoArchivePage(1);
              loadPhotoArchives({ page: 1, pageSize: value });
            }}
          >
            {[10, 20, 50].map((size) => (
              <Option key={size} value={size}>{size} 条</Option>
            ))}
          </Select>
          <Pagination
            current={photoArchivePage}
            pageSize={photoArchivePageSize}
            total={photoArchiveTotal}
            size="small"
            onChange={(page) => {
              setPhotoArchivePage(page);
              loadPhotoArchives({ page });
            }}
          />
        </div>
      </Modal>

      <TerminalListModal
        visible={missingOpen}
        title={`缺失终端 · ${missingPolicy?.display_name || ""}`}
        terminals={missingTerminals}
        loading={missingLoading}
        summaryLabel="家未拍照终端"
        emptyText="暂无缺失终端"
        onClose={() => setMissingOpen(false)}
      />

      <Modal
        title="新增记录"
        visible={extractionRecordsOpen}
        footer={null}
        onCancel={() => setExtractionRecordsOpen(false)}
        className="extraction-records-modal"
        unmountOnExit
      >
        <div className="export-record-toolbar">
          <Text type="secondary">记录保留30天，报错信息所有用户可查看</Text>
          <Button
            size="small"
            loading={extractionRecordsLoading}
            onClick={loadExtractionRecords}
          >
            刷新
          </Button>
        </div>
        {extractionRecords.length ? (
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
                {extractionRecords.map((record) => {
                  const methodLabel =
                    record.method === "batch" ? "批量提取" : "单链接提取";
                  const statusMap = {
                    processing: { label: "处理中", color: "blue" },
                    success: { label: "成功", color: "green" },
                    partial_success: { label: "部分成功", color: "orange" },
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
                        <TableEllipsis
                          value={
                            record.owner_display_name ||
                            record.owner_username
                          }
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
                            onClick={() =>
                              openExtractionError(record.error_information)
                            }
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
          <EmptyBox
            text={extractionRecordsLoading ? "正在读取新增记录" : "暂无新增记录"}
          />
        )}
      </Modal>

      <Modal
        title="报错信息"
        visible={extractionErrorOpen}
        footer={null}
        onCancel={() => setExtractionErrorOpen(false)}
        className="extraction-error-modal"
        unmountOnExit
      >
        <pre className="extraction-error-content">
          {extractionError || "暂无报错信息"}
        </pre>
      </Modal>

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
            <SingleExtract
              csrfToken={csrfToken}
              onRefreshResults={refreshAfterExtraction}
            />
          </TabPane>
          <TabPane key="batch" title="批量提取">
            <BatchExtract
              csrfToken={csrfToken}
              onRefreshResults={refreshAfterExtraction}
            />
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

      {previewImage ? (
        <div className="fullscreen-preview" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <button className="fullscreen-close" type="button" onClick={() => setPreviewImage(null)}>
            关闭
          </button>
          <img
            className="fullscreen-image"
            src={previewImage.url}
            alt={previewImage.filename || "图片预览"}
            onClick={(event) => event.stopPropagation()}
          />
          <ImageArchiveBadges
            tags={previewImage.archive_tags || []}
            expanded
            onRemove={(tag) => confirmRemoveArchiveTag(previewImage, tag)}
          />
        </div>
      ) : null}
    </div>
  );
}

const CUSTOMER_OPTIONS = {
  statuses: ["运营", "停用"],
  salespeople: ["黄春梅", "罗伟", "韦春云", "李富马"],
  snowSalespeople: ["陈家利", "陈俊杰"],
  pageSizes: [20, 50, 100],
};

const POLICY_TAG_OPTIONS = [
  "主推店",
  "超勇冰冻10+2",
  "超勇冰冻10+1",
  "花车",
  "旺季套餐陈列",
  "纯生3+1",
  "夜市陈列",
];

const SNOW_RULE_FIELDS = [
  { value: "outbound_remark", label: "出库单备注", operators: ["equals", "contains"] },
  { value: "sale_type", label: "售卖类型", operators: ["equals", "contains"] },
  { value: "converted_boxes", label: "折合箱数", operators: ["equals", "greater_than", "less_than"] },
];

const SNOW_RULE_OPERATORS = {
  equals: "等于",
  contains: "包含",
  greater_than: "大于",
  less_than: "小于",
};

function newSnowCondition() {
  return { field: "outbound_remark", operator: "contains", value: "" };
}

function newSnowRule(tag = "主推店") {
  return { tag, conditions: [newSnowCondition()] };
}

function cloneRules(rules) {
  return JSON.parse(JSON.stringify(rules || []));
}

const EMPTY_CUSTOMER_FORM = {
  id: null,
  terminal_code: "",
  customer_name: "",
  status: "运营",
  route: "",
  salesperson: "",
  snow_salesperson: "",
  contact: "",
  address: "",
  phone: "",
  remark: "",
  version: 0,
};

const EMPTY_CUSTOMER_FILTERS = {
  terminal_code: "",
  customer_name: "",
  route: "",
  salesperson: "",
  snow_salesperson: "",
};

function personColorClass(name) {
  return {
    黄春梅: "person-blue",
    罗伟: "person-cyan",
    韦春云: "person-green",
    李富马: "person-orange",
    陈家利: "person-purple",
    陈俊杰: "person-magenta",
  }[name] || "person-gray";
}

function policyTagClass(tag) {
  return {
    主推店: "policy-blue",
    "超勇冰冻10+2": "policy-cyan",
    "超勇冰冻10+1": "policy-green",
    花车: "policy-orange",
    旺季套餐陈列: "policy-purple",
    "纯生3+1": "policy-magenta",
    夜市陈列: "policy-red",
  }[tag] || "policy-gray";
}

function policyColorClass(color) {
  return `policy-${color || "gray"}`;
}

function CustomerManagement({ csrfToken, isAdmin, currentUser }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({ ...EMPTY_CUSTOMER_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_CUSTOMER_FILTERS });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CUSTOMER_FORM });
  const [saving, setSaving] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsCustomer, setLogsCustomer] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [policyMonth, setPolicyMonth] = useState("");
  const [policyMonths, setPolicyMonths] = useState([]);
  const [policyTag, setPolicyTag] = useState("");
  const [policyTagOptions, setPolicyTagOptions] = useState([]);
  const [routeOptions, setRouteOptions] = useState([]);
  const [snowOpen, setSnowOpen] = useState(false);
  const [snowFile, setSnowFile] = useState(null);
  const [snowUpdatePolicy, setSnowUpdatePolicy] = useState(true);
  const [snowRules, setSnowRules] = useState([newSnowRule()]);
  const [snowTemplates, setSnowTemplates] = useState([]);
  const [snowTemplateId, setSnowTemplateId] = useState("");
  const [snowTemplateName, setSnowTemplateName] = useState("");
  const [snowTemplateDefault, setSnowTemplateDefault] = useState(false);
  const [savingSnowTemplate, setSavingSnowTemplate] = useState(false);
  const [snowPreview, setSnowPreview] = useState(null);
  const [previewingSnow, setPreviewingSnow] = useState(false);
  const [committingSnow, setCommittingSnow] = useState(false);
  const requestSequence = useRef(0);

  async function loadCustomers() {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    const params = new URLSearchParams({
      ...appliedFilters,
      policy_month: policyMonth,
      policy_tag: policyTag,
      page: String(page),
      page_size: String(pageSize),
    });
    try {
      const data = await jsonFetch(`/api/customers?${params.toString()}`);
      if (sequence !== requestSequence.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setStatus(null);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setStatus({ type: "error", message: error.message });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [page, pageSize, appliedFilters, policyMonth, policyTag]);

  useEffect(() => {
    loadSnowOptions();
    loadCustomerOptions();
  }, []);

  useEffect(() => {
    if (!policyMonth) {
      setPolicyTagOptions([]);
      setPolicyTag("");
      return;
    }
    loadPolicyTagOptions(policyMonth);
  }, [policyMonth]);

  async function loadSnowOptions(preferredMonth = "") {
    try {
      const data = await jsonFetch("/api/snow-outbound/options");
      const months = Array.from(
        new Set([data.current_month, ...(data.months || [])].filter(Boolean))
      );
      setPolicyMonths(months);
      setPolicyMonth((current) => preferredMonth || current || data.current_month || months[0] || "");
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function loadCustomerOptions() {
    try {
      const data = await jsonFetch("/api/customers/options");
      setRouteOptions(data.routes || []);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function loadPolicyTagOptions(month) {
    try {
      const data = await jsonFetch(
        `/api/customers/policy-options?month=${encodeURIComponent(month)}`
      );
      const options = data.items || [];
      setPolicyTagOptions(options);
      setPolicyTag((current) => options.includes(current) ? current : "");
    } catch (error) {
      setPolicyTagOptions([]);
      setPolicyTag("");
      setStatus({ type: "error", message: error.message });
    }
  }

  async function loadSnowTemplates() {
    const data = await jsonFetch("/api/snow-outbound/templates");
    const templates = data.items || [];
    setSnowTemplates(templates);
    return templates;
  }

  function searchCustomers() {
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  function resetSearch() {
    setFilters({ ...EMPTY_CUSTOMER_FILTERS });
    setPolicyTag("");
    setPage(1);
    setAppliedFilters({ ...EMPTY_CUSTOMER_FILTERS });
  }

  function openCreate() {
    setForm({ ...EMPTY_CUSTOMER_FORM });
    setFormOpen(true);
  }

  function openEdit(customer) {
    setForm({
      ...EMPTY_CUSTOMER_FORM,
      ...customer,
    });
    setFormOpen(true);
  }

  async function saveCustomer() {
    setSaving(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const isEdit = Boolean(form.id);
      await jsonFetch(isEdit ? `/api/customers/${form.id}` : "/api/customers", {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ ...form, csrf_token: token }),
      });
      Message.success(isEdit ? "客户档案已更新" : "客户档案已新增");
      setFormOpen(false);
      await loadCustomers();
      await loadCustomerOptions();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteCustomer(customer) {
    Modal.confirm({
      title: "删除客户档案",
      content: `确定删除 ${customer.terminal_code}｜${customer.customer_name} 吗？删除后终端编码不可重新使用。`,
      okText: "确认删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          const token = await latestCsrfToken(csrfToken);
          await jsonFetch(`/api/customers/${customer.id}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token },
          });
          Message.success("客户档案已删除");
          if (items.length === 1 && page > 1) {
            setPage(page - 1);
          } else {
            await loadCustomers();
          }
          await loadCustomerOptions();
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  async function openLogs(customer) {
    setLogsCustomer(customer);
    setLogs([]);
    setLogsOpen(true);
    setLogsLoading(true);
    try {
      const data = await jsonFetch(`/api/customers/${customer.id}/logs`);
      setLogs(data.items || []);
    } catch (error) {
      Message.error(error.message);
    } finally {
      setLogsLoading(false);
    }
  }

  async function importCustomers() {
    if (!importFile) return;
    setImporting(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const body = new FormData();
      body.append("file", importFile);
      body.append("csrf_token", token);
      const data = await jsonFetch("/api/customers/import", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        body,
      });
      setImportResult(data);
      Message.success(`导入完成：成功 ${data.success_count} 条，失败 ${data.failed_count} 条`);
      await loadCustomers();
      await loadCustomerOptions();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setImporting(false);
    }
  }

  function openSnowUpload() {
    setSnowOpen(true);
    setSnowFile(null);
    setSnowPreview(null);
    setSnowUpdatePolicy(true);
  }

  function selectSnowTemplate(templateId, source = snowTemplates) {
    const template = source.find((item) => item.id === templateId);
    if (!template) {
      setSnowTemplateId("");
      setSnowTemplateName("");
      setSnowTemplateDefault(false);
      setSnowRules([newSnowRule()]);
      setSnowPreview(null);
      return;
    }
    setSnowTemplateId(template.id);
    setSnowTemplateName(template.name);
    setSnowTemplateDefault(template.is_default);
    setSnowRules(cloneRules(template.rules));
    setSnowPreview(null);
  }

  function changeSnowRules(nextRules) {
    setSnowRules(nextRules);
    setSnowPreview(null);
  }

  function updateSnowRule(ruleIndex, patch) {
    changeSnowRules(
      snowRules.map((rule, index) => index === ruleIndex ? { ...rule, ...patch } : rule)
    );
  }

  function updateSnowCondition(ruleIndex, conditionIndex, patch) {
    const nextRules = cloneRules(snowRules);
    const condition = nextRules[ruleIndex].conditions[conditionIndex];
    const nextCondition = { ...condition, ...patch };
    if (patch.field) {
      const field = SNOW_RULE_FIELDS.find((item) => item.value === patch.field);
      if (field && !field.operators.includes(nextCondition.operator)) {
        nextCondition.operator = field.operators[0];
      }
    }
    nextRules[ruleIndex].conditions[conditionIndex] = nextCondition;
    changeSnowRules(nextRules);
  }

  function addSnowRule() {
    const used = new Set(snowRules.map((rule) => rule.tag));
    const tag = POLICY_TAG_OPTIONS.find((item) => !used.has(item));
    if (!tag) return;
    changeSnowRules([...snowRules, newSnowRule(tag)]);
  }

  function addSnowCondition(ruleIndex) {
    const nextRules = cloneRules(snowRules);
    if (nextRules[ruleIndex].conditions.length >= 3) return;
    nextRules[ruleIndex].conditions.push(newSnowCondition());
    changeSnowRules(nextRules);
  }

  function removeSnowCondition(ruleIndex, conditionIndex) {
    const nextRules = cloneRules(snowRules);
    if (nextRules[ruleIndex].conditions.length <= 1) return;
    nextRules[ruleIndex].conditions.splice(conditionIndex, 1);
    changeSnowRules(nextRules);
  }

  async function saveSnowTemplate() {
    setSavingSnowTemplate(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const endpoint = snowTemplateId
        ? `/api/snow-outbound/templates/${snowTemplateId}`
        : "/api/snow-outbound/templates";
      const data = await jsonFetch(endpoint, {
        method: snowTemplateId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          name: snowTemplateName,
          rules: snowRules,
          is_default: snowTemplateDefault,
          csrf_token: token,
        }),
      });
      setSnowTemplateId(data.id);
      await loadSnowTemplates();
      Message.success(snowTemplateId ? "规则模板已更新" : "规则模板已保存");
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSavingSnowTemplate(false);
    }
  }

  function deleteSnowTemplate() {
    if (!snowTemplateId) return;
    Modal.confirm({
      title: "删除规则模板",
      content: `确定删除模板“${snowTemplateName}”吗？历史导入的规则快照不会受影响。`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          const token = await latestCsrfToken(csrfToken);
          await jsonFetch(`/api/snow-outbound/templates/${snowTemplateId}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token },
          });
          setSnowTemplateId("");
          setSnowTemplateName("");
          setSnowTemplateDefault(false);
          await loadSnowTemplates();
          Message.success("规则模板已删除");
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  async function previewSnowOutbound() {
    if (!snowFile) return;
    setPreviewingSnow(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const body = new FormData();
      body.append("file", snowFile);
      body.append("update_policy", String(snowUpdatePolicy));
      body.append("csrf_token", token);
      const data = await jsonFetch("/api/snow-outbound/preview", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        body,
      });
      setSnowPreview(data);
      Message.success("文件解析完成，请确认覆盖月份及命中结果");
    } catch (error) {
      Message.error(error.message);
    } finally {
      setPreviewingSnow(false);
    }
  }

  async function commitSnowOutbound() {
    if (!snowPreview?.preview_id) return;
    setCommittingSnow(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const data = await jsonFetch("/api/snow-outbound/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          preview_id: snowPreview.preview_id,
          csrf_token: token,
        }),
      });
      const preferredMonth = data.months?.[0] || policyMonth;
      setSnowOpen(false);
      setPage(1);
      await loadSnowOptions(preferredMonth);
      await loadCustomers();
      Message.success(
        `导入完成：${data.row_count}条明细，${data.tag_count}个政策标签，自动建档${data.auto_customer_count}家`
      );
    } catch (error) {
      Message.error(error.message);
    } finally {
      setCommittingSnow(false);
    }
  }

  const canSave =
    /^\d{10}$/.test(form.terminal_code) &&
    form.customer_name.trim();
  const snowRulesReady =
    snowRules.length > 0 &&
    snowRules.every(
      (rule) =>
        rule.tag &&
        rule.conditions.length >= 1 &&
        rule.conditions.length <= 3 &&
        rule.conditions.every((condition) => String(condition.value || "").trim())
    ) &&
    new Set(snowRules.map((rule) => rule.tag)).size === snowRules.length;
  const selectedSnowTemplate = snowTemplates.find((item) => item.id === snowTemplateId);
  const canEditSnowTemplate =
    !snowTemplateId ||
    isAdmin ||
    selectedSnowTemplate?.created_by === currentUser;

  return (
    <div className="customer-page">
      <Card bordered className="customer-filter-card">
        <div className="customer-filter-grid">
          <Select
            value={policyMonth || undefined}
            placeholder="雪花政策月份"
            onChange={(value) => {
              setPage(1);
              setPolicyTag("");
              setPolicyMonth(value);
            }}
          >
            {policyMonths.map((month) => <Option key={month} value={month}>{month}</Option>)}
          </Select>
          <Select
            value={policyTag || undefined}
            allowClear
            placeholder="雪花政策"
            onChange={(value) => {
              setPage(1);
              setPolicyTag(value || "");
            }}
          >
            {policyTagOptions.map((tag) => <Option key={tag} value={tag}>{tag}</Option>)}
          </Select>
          <Input
            value={filters.terminal_code}
            maxLength={10}
            placeholder="终端编码"
            onChange={(value) => setFilters({ ...filters, terminal_code: value.replace(/\D/g, "") })}
            onPressEnter={searchCustomers}
          />
          <Input
            value={filters.customer_name}
            placeholder="客户全名"
            onChange={(value) => setFilters({ ...filters, customer_name: value })}
            onPressEnter={searchCustomers}
          />
          <Select
            value={filters.route || undefined}
            allowClear
            showSearch
            placeholder="线路归属"
            onChange={(value) => setFilters({ ...filters, route: value || "" })}
          >
            {routeOptions.map((route) => (
              <Option key={route} value={route}>{route}</Option>
            ))}
          </Select>
          <Select
            value={filters.salesperson || undefined}
            allowClear
            placeholder="业务员"
            onChange={(value) => setFilters({ ...filters, salesperson: value || "" })}
          >
            {CUSTOMER_OPTIONS.salespeople.map((name) => <Option key={name} value={name}>{name}</Option>)}
          </Select>
          <Select
            value={filters.snow_salesperson || undefined}
            allowClear
            placeholder="雪花业务员"
            onChange={(value) => setFilters({ ...filters, snow_salesperson: value || "" })}
          >
            {CUSTOMER_OPTIONS.snowSalespeople.map((name) => <Option key={name} value={name}>{name}</Option>)}
          </Select>
          <Space className="customer-filter-actions">
            <Button type="primary" loading={loading} onClick={searchCustomers}>查询</Button>
            <Button onClick={resetSearch}>重置</Button>
          </Space>
        </div>
      </Card>

      <Card bordered className="customer-list-card">
        <div className="customer-toolbar">
          <div>
            <strong>终端明细</strong>
            <span className="customer-total">共 {total} 条</span>
          </div>
          <Space wrap>
            <Button className="add-button" type="primary" onClick={openCreate}>新增客户</Button>
            {isAdmin ? (
              <Button onClick={() => {
                setImportFile(null);
                setImportResult(null);
                setImportOpen(true);
              }}>
                批量新增
              </Button>
            ) : null}
          </Space>
        </div>
        <Status status={status} />
        <div className="customer-table-shell">
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th className="sticky-code">终端编码</th>
                  <th className="sticky-customer">客户全名</th>
                  <th>线路归属</th>
                  <th>业务员</th>
                  <th>雪花业务员</th>
                  <th>状态</th>
                  <th>雪花政策</th>
                  <th>联系人</th>
                  <th>客户手机</th>
                  <th>客户地址</th>
                  <th>备注</th>
                  <th>最后修改</th>
                  <th className="sticky-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((customer) => (
                  <tr key={customer.id}>
                    <td className="sticky-code"><span className="terminal-code">{customer.terminal_code}</span></td>
                    <td className="sticky-customer">
                      <TableEllipsis
                        value={customer.customer_name}
                        className="customer-name-cell"
                        maxWidth={246}
                      />
                    </td>
                    <td>
                      <TableEllipsis value={customer.route} maxWidth={150} />
                    </td>
                    <td>
                      {customer.salesperson ? (
                        <span className={`person-tag ${personColorClass(customer.salesperson)}`}>{customer.salesperson}</span>
                      ) : "-"}
                    </td>
                    <td>
                      {customer.snow_salesperson ? (
                        <span className={`person-tag ${personColorClass(customer.snow_salesperson)}`}>{customer.snow_salesperson}</span>
                      ) : "-"}
                    </td>
                    <td>
                      <Tag className={`customer-status-tag ${customer.status === "运营" ? "active" : "inactive"}`}>
                        {customer.status}
                      </Tag>
                    </td>
                    <td>
                      <TablePolicyTags tags={customer.policy_tag_details || []} />
                    </td>
                    <td>
                      <TableEllipsis value={customer.contact} maxWidth={110} />
                    </td>
                    <td>{customer.phone || "-"}</td>
                    <td>
                      <TableEllipsis
                        value={customer.address}
                        className="ellipsis-cell"
                        maxWidth={240}
                      />
                    </td>
                    <td>
                      <TableEllipsis
                        value={customer.remark}
                        className="ellipsis-cell"
                        maxWidth={190}
                      />
                    </td>
                    <td>
                      <span className="updated-cell" title={formatDateTime(customer.updated_at)}>
                        <span className="updated-time">{formatCompactDateTime(customer.updated_at)}</span>
                        <span className="updated-user">{customer.updated_by_name || "-"}</span>
                      </span>
                    </td>
                    <td className="sticky-actions">
                      <span className="customer-action-links">
                        <button className="customer-action-link edit" type="button" onClick={() => openEdit(customer)}>编辑</button>
                        <button className="customer-action-link logs" type="button" onClick={() => openLogs(customer)}>记录</button>
                        {isAdmin ? (
                          <button className="customer-action-link delete" type="button" onClick={() => deleteCustomer(customer)}>删除</button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !items.length ? (
            <div className="customer-empty-overlay">暂无符合条件的客户档案</div>
          ) : null}
          {loading ? <div className="customer-loading"><Spin size={30} /></div> : null}
        </div>
        <div className="customer-pagination">
          <span>每页</span>
          <Select
            size="small"
            value={pageSize}
            onChange={(value) => {
              setPage(1);
              setPageSize(value);
            }}
          >
            {CUSTOMER_OPTIONS.pageSizes.map((size) => <Option key={size} value={size}>{size} 条</Option>)}
          </Select>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            size="small"
            disabled={loading}
            onChange={setPage}
          />
        </div>
      </Card>

      <Modal
        title={form.id ? "编辑客户档案" : "新增客户档案"}
        visible={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={saveCustomer}
        okText={form.id ? "保存修改" : "确认新增"}
        okButtonProps={{ loading: saving, disabled: !canSave }}
        className="customer-form-modal"
        unmountOnExit
      >
        <div className="customer-form-grid">
          <div>
            <label><i>*</i>终端编码</label>
            <Input
              value={form.terminal_code}
              maxLength={10}
              placeholder="10位纯数字"
              onChange={(value) => setForm({ ...form, terminal_code: value.replace(/\D/g, "") })}
            />
          </div>
          <div>
            <label><i>*</i>客户全名</label>
            <Input value={form.customer_name} maxLength={200} onChange={(value) => setForm({ ...form, customer_name: value })} />
          </div>
          <div>
            <label><i>*</i>状态</label>
            <Select value={form.status} onChange={(value) => setForm({ ...form, status: value })}>
              {CUSTOMER_OPTIONS.statuses.map((value) => <Option key={value} value={value}>{value}</Option>)}
            </Select>
          </div>
          <div>
            <label>线路归属</label>
            <Input value={form.route} maxLength={100} onChange={(value) => setForm({ ...form, route: value })} />
          </div>
          <div>
            <label>业务员</label>
            <Select
              value={form.salesperson || undefined}
              allowClear
              placeholder="可不选择"
              onChange={(value) => setForm({ ...form, salesperson: value || "" })}
            >
              {CUSTOMER_OPTIONS.salespeople.map((name) => <Option key={name} value={name}>{name}</Option>)}
            </Select>
          </div>
          <div>
            <label>雪花业务员</label>
            <Select
              value={form.snow_salesperson || undefined}
              allowClear
              placeholder="可不选择"
              onChange={(value) => setForm({ ...form, snow_salesperson: value || "" })}
            >
              {CUSTOMER_OPTIONS.snowSalespeople.map((name) => <Option key={name} value={name}>{name}</Option>)}
            </Select>
          </div>
          <div>
            <label>客户联系人</label>
            <Input value={form.contact} maxLength={100} onChange={(value) => setForm({ ...form, contact: value })} />
          </div>
          <div>
            <label>客户手机</label>
            <Input value={form.phone} maxLength={50} onChange={(value) => setForm({ ...form, phone: value })} />
          </div>
          <div className="full-row">
            <label>客户地址</label>
            <Input value={form.address} maxLength={500} onChange={(value) => setForm({ ...form, address: value })} />
          </div>
          <div className="full-row">
            <label>备注</label>
            <textarea
              className="customer-textarea"
              value={form.remark}
              maxLength={1000}
              rows={3}
              onChange={(event) => setForm({ ...form, remark: event.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={`修改记录${logsCustomer ? `｜${logsCustomer.customer_name}` : ""}`}
        visible={logsOpen}
        footer={null}
        onCancel={() => setLogsOpen(false)}
        className="customer-logs-modal"
        unmountOnExit
      >
        {logsLoading ? (
          <div className="logs-loading"><Spin /></div>
        ) : logs.length ? (
          <div className="customer-timeline">
            {logs.map((log) => (
              <div className="customer-log" key={log.id}>
                <span className={`log-dot ${log.action_type}`} />
                <div>
                  <div className="log-meta">
                    <strong>{log.operator_name || log.operator}</strong>
                    <span>{formatDateTime(log.operated_at)}</span>
                  </div>
                  <div className="log-action">{log.action_summary}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty description="暂无修改记录" />}
      </Modal>

      <Modal
        title="批量新增客户"
        visible={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={importCustomers}
        okText="开始导入"
        okButtonProps={{ loading: importing, disabled: !importFile }}
        className="customer-import-modal"
        unmountOnExit
      >
        <div className="customer-import-guide">
          <Alert
            type="info"
            showIcon
            content="建议使用标准模板上传 .xlsx 文件。合法行正常录入，失败行不会录入。"
          />
          <Button onClick={() => downloadFile("/api/customers/import-template", "客户档案导入模板.xlsx")}>
            下载标准模板
          </Button>
        </div>
        <label className="customer-file-picker">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setImportFile(event.target.files?.[0] || null);
              setImportResult(null);
            }}
          />
          <span>{importFile ? importFile.name : "请上传文档"}</span>
        </label>
        {importResult ? (
          <div className="import-result">
            <div><strong>{importResult.total_count}</strong><span>总行数</span></div>
            <div className="success"><strong>{importResult.success_count}</strong><span>成功</span></div>
            <div className="danger"><strong>{importResult.failed_count}</strong><span>失败</span></div>
            {importResult.error_report_url ? (
              <Button onClick={() => downloadFile(importResult.error_report_url, "客户档案导入失败明细.xlsx")}>
                下载失败明细
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title="雪花出库上传"
        visible={snowOpen}
        onCancel={() => {
          if (!committingSnow) setSnowOpen(false);
        }}
        onOk={snowPreview ? commitSnowOutbound : previewSnowOutbound}
        okText={snowPreview ? "确认覆盖并导入" : "解析并预览"}
        okButtonProps={{
          loading: snowPreview ? committingSnow : previewingSnow,
          disabled: snowPreview ? false : !snowFile,
        }}
        cancelButtonProps={{ disabled: committingSnow }}
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
                  setSnowFile(event.target.files?.[0] || null);
                  setSnowPreview(null);
                }}
              />
              <span className="snow-file-icon">XL</span>
              <span>
                <strong>{snowFile ? snowFile.name : "仅支持雪花系统导出的出库 Excel"}</strong>
                <small className={snowFile ? "" : "snow-file-warning"}>
                  {snowFile ? `${(snowFile.size / 1024).toFixed(1)} KB` : "请勿上传其他表格，传错文件可能导致数据错乱"}
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
              checked={snowUpdatePolicy}
              onChange={(checked) => {
                setSnowUpdatePolicy(checked);
                setSnowPreview(null);
              }}
            />
          </section>

          {false ? <>
          <section className="snow-section">
            <div className="snow-section-title">
              <strong>2. 标签规则模板</strong>
              <span>每个标签仅对应一个条件组，组内条件全部成立才会命中</span>
            </div>
            <div className="snow-template-toolbar">
              <Select
                value={snowTemplateId || undefined}
                allowClear
                placeholder="选择已保存模板"
                onChange={(value) => selectSnowTemplate(value || "")}
              >
                {snowTemplates.map((template) => (
                  <Option key={template.id} value={template.id}>
                    {template.name}{template.is_default ? "（默认）" : ""}
                  </Option>
                ))}
              </Select>
              <Input
                value={snowTemplateName}
                maxLength={100}
                placeholder="模板名称"
                onChange={setSnowTemplateName}
              />
              <Checkbox
                checked={snowTemplateDefault}
                onChange={setSnowTemplateDefault}
              >
                默认模板
              </Checkbox>
              <Button
                loading={savingSnowTemplate}
                disabled={!snowTemplateName.trim() || !snowRulesReady || !canEditSnowTemplate}
                onClick={saveSnowTemplate}
              >
                {snowTemplateId ? "更新模板" : "保存模板"}
              </Button>
              {snowTemplateId ? (
                <Button
                  onClick={() => {
                    setSnowTemplateId("");
                    setSnowTemplateName(`${snowTemplateName}副本`);
                    setSnowTemplateDefault(false);
                  }}
                >
                  另存为
                </Button>
              ) : null}
              {snowTemplateId && canEditSnowTemplate ? (
                <Button status="danger" onClick={deleteSnowTemplate}>删除模板</Button>
              ) : null}
            </div>
          </section>

          <section className="snow-section">
            <div className="snow-section-title rule-title-line">
              <div>
                <strong>3. 设置标签映射</strong>
                <span>最多7组，每组最多3个条件</span>
              </div>
              <Button
                size="small"
                type="primary"
                disabled={snowRules.length >= POLICY_TAG_OPTIONS.length}
                onClick={addSnowRule}
              >
                添加标签规则
              </Button>
            </div>
            <div className="snow-rule-list">
              {snowRules.map((rule, ruleIndex) => {
                const usedTags = new Set(snowRules.map((item) => item.tag));
                return (
                  <div className="snow-rule-card" key={`${rule.tag}-${ruleIndex}`}>
                    <div className="snow-rule-head">
                      <span className="snow-rule-number">{ruleIndex + 1}</span>
                      <span>映射标签</span>
                      <Select
                        value={rule.tag}
                        onChange={(value) => updateSnowRule(ruleIndex, { tag: value })}
                      >
                        {POLICY_TAG_OPTIONS
                          .filter((tag) => tag === rule.tag || !usedTags.has(tag))
                          .map((tag) => <Option key={tag} value={tag}>{tag}</Option>)}
                      </Select>
                      <span className={`policy-tag ${policyTagClass(rule.tag)}`}>{rule.tag}</span>
                      <Button
                        size="mini"
                        status="danger"
                        disabled={snowRules.length <= 1}
                        onClick={() => changeSnowRules(snowRules.filter((_item, index) => index !== ruleIndex))}
                      >
                        删除本组
                      </Button>
                    </div>
                    <div className="snow-condition-list">
                      {rule.conditions.map((condition, conditionIndex) => {
                        const field = SNOW_RULE_FIELDS.find((item) => item.value === condition.field);
                        return (
                          <div className="snow-condition-row" key={`${condition.field}-${conditionIndex}`}>
                            <span className="condition-join">{conditionIndex ? "并且" : "当"}</span>
                            <Select
                              value={condition.field}
                              onChange={(value) => updateSnowCondition(ruleIndex, conditionIndex, { field: value })}
                            >
                              {SNOW_RULE_FIELDS.map((item) => <Option key={item.value} value={item.value}>{item.label}</Option>)}
                            </Select>
                            <Select
                              value={condition.operator}
                              onChange={(value) => updateSnowCondition(ruleIndex, conditionIndex, { operator: value })}
                            >
                              {(field?.operators || []).map((operator) => (
                                <Option key={operator} value={operator}>{SNOW_RULE_OPERATORS[operator]}</Option>
                              ))}
                            </Select>
                            <Input
                              value={String(condition.value ?? "")}
                              placeholder={condition.field === "converted_boxes" ? "输入数值" : "输入匹配内容"}
                              onChange={(value) => updateSnowCondition(ruleIndex, conditionIndex, { value })}
                            />
                            <Button
                              size="mini"
                              disabled={rule.conditions.length <= 1}
                              onClick={() => removeSnowCondition(ruleIndex, conditionIndex)}
                            >
                              移除
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      size="mini"
                      type="text"
                      disabled={rule.conditions.length >= 3}
                      onClick={() => addSnowCondition(ruleIndex)}
                    >
                      + 添加条件
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
          </> : null}

          {snowPreview ? (
            <section className="snow-section snow-preview-section">
              <div className="snow-section-title">
                <strong>解析预览</strong>
              </div>
              <div className="snow-preview-grid">
                <div><strong>{snowPreview.months.join("、")}</strong><span>覆盖月份</span></div>
                <div><strong>{snowPreview.row_count}</strong><span>明细行</span></div>
                <div><strong>{snowPreview.ticket_count}</strong><span>票号</span></div>
                <div><strong>{snowPreview.terminal_count}</strong><span>终端</span></div>
                <div><strong>{snowPreview.tag_count}</strong><span>命中标签</span></div>
                <div><strong>{snowPreview.policy_count}</strong><span>参与政策</span></div>
                <div><strong>{snowPreview.auto_customer_count}</strong><span>自动建档</span></div>
                <div><strong>{snowPreview.negative_row_count}</strong><span>负数行（不打标）</span></div>
              </div>
              {snowPreview.unknown_salespeople?.length ? (
                <Alert
                  type="warning"
                  showIcon
                  content={`未识别业务员：${snowPreview.unknown_salespeople.join("、")}。相关自动建档人员字段将留空。`}
                />
              ) : null}
              <div className="snow-tag-summary">
                {Object.keys(snowPreview.tag_counts || {}).map((tag) => (
                  <span key={tag}>
                    <span className={`policy-tag ${policyColorClass(snowPreview.tag_colors?.[tag])}`}>{tag}</span>
                    <strong>{snowPreview.tag_counts?.[tag] || 0}</strong>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function SnowOutboundUploadModal({ visible, csrfToken, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [updatePolicy, setUpdatePolicy] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setUpdatePolicy(true);
    setPreview(null);
  }, [visible]);

  async function previewFile() {
    if (!file) return;
    setPreviewing(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const body = new FormData();
      body.append("file", file);
      body.append("update_policy", String(updatePolicy));
      body.append("csrf_token", token);
      const data = await jsonFetch("/api/snow-outbound/preview", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
        body,
      });
      setPreview(data);
      Message.success("文件解析完成，请确认覆盖月份及命中结果");
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
      const token = await latestCsrfToken(csrfToken);
      const data = await jsonFetch("/api/snow-outbound/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          preview_id: preview.preview_id,
          csrf_token: token,
        }),
      });
      onClose();
      await onImported?.(data);
      Message.success(
        `导入完成：${data.row_count}条明细，${data.tag_count}个政策标签，自动建档${data.auto_customer_count}家`
      );
    } catch (error) {
      Message.error(error.message);
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
            }}
          />
        </section>

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
                  <span className={`policy-tag ${policyColorClass(preview.tag_colors?.[tag])}`}>{tag}</span>
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

const EMPTY_POLICY_FILTERS = {
  year: "",
  month: "",
  outbound_code: "",
  name: "",
  enabled: "",
};

function emptyPolicyForm() {
  return {
    id: "",
    name: "",
    outbound_code: "",
    explanation: "",
    requires_photo: false,
    set_limit: "",
    month_target: "",
    year: 2026,
    month: new Date().getMonth() + 1,
    conditions: [
      {
        field: "outbound_remark",
        operator: "contains",
        value: "",
        auto_code: true,
      },
    ],
  };
}

function SnowPolicyManagement({ csrfToken, isAdmin }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({ ...EMPTY_POLICY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_POLICY_FILTERS });
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyPolicyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [latestUploadAt, setLatestUploadAt] = useState("");
  const [terminalListOpen, setTerminalListOpen] = useState(false);
  const [terminalListPolicy, setTerminalListPolicy] = useState(null);
  const [terminalListKind, setTerminalListKind] = useState("pending");
  const [terminalListItems, setTerminalListItems] = useState([]);
  const [terminalListLoading, setTerminalListLoading] = useState(false);
  const latestUploadDate = getDateParts(latestUploadAt);
  const sequence = useRef(0);
  const monthOptions = Array.from({ length: 12 }, (_item, index) => index + 1);
  const terminalListMeta = {
    shipped: {
      countField: "shipped_count",
      endpoint: "shipped-terminals",
      title: "已出库终端",
      summaryLabel: "家已出库终端",
      emptyText: "暂无已出库终端",
    },
    photographed: {
      countField: "photographed_count",
      endpoint: "photographed-terminals",
      title: "已拍照终端",
      summaryLabel: "家已拍照终端",
      emptyText: "暂无已拍照终端",
    },
    pending: {
      countField: "pending_outbound_count",
      endpoint: "pending-outbound",
      title: "待出库终端",
      summaryLabel: "家待出库终端",
      emptyText: "暂无待出库终端",
    },
  };

  async function loadPolicies() {
    const requestId = ++sequence.current;
    setLoading(true);
    const params = new URLSearchParams({
      ...appliedFilters,
      page: String(page),
      page_size: String(pageSize),
    });
    try {
      const data = await jsonFetch(`/api/snow-outbound/policies?${params}`);
      if (requestId !== sequence.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLatestUploadAt(data.latest_upload_at || "");
      setStatus(null);
    } catch (error) {
      if (requestId === sequence.current) {
        setStatus({ type: "error", message: error.message });
      }
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, [page, pageSize, appliedFilters]);

  function openPolicyCreate() {
    setForm(emptyPolicyForm());
    setFormError("");
    setFormOpen(true);
  }

  function openPolicyEdit(policy) {
    setForm({
      ...policy,
      set_limit: policy.set_limit ?? "",
      month_target: policy.month_target ?? "",
      conditions: (policy.conditions || []).map((condition) => ({
        ...condition,
        value: String(condition.value ?? ""),
        auto_code: false,
      })),
    });
    setFormError("");
    setFormOpen(true);
  }

  function updatePolicyForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setFormError("");
  }

  function setOutboundCode(value) {
    setForm((current) => ({
      ...current,
      outbound_code: value,
      conditions: current.conditions.map((condition) =>
        condition.field === "outbound_remark" && condition.auto_code
          ? { ...condition, value }
          : condition
      ),
    }));
    setFormError("");
  }

  function updatePolicyCondition(index, patch) {
    setForm((current) => {
      const conditions = current.conditions.map((condition, position) => {
        if (position !== index) return condition;
        const next = { ...condition, ...patch };
        if (patch.field) {
          const field = SNOW_RULE_FIELDS.find((item) => item.value === patch.field);
          if (!field?.operators.includes(next.operator)) {
            next.operator = field?.operators[0] || "equals";
          }
          if (patch.field === "outbound_remark") {
            next.value = current.outbound_code;
            next.auto_code = true;
          } else {
            next.value = "";
            next.auto_code = false;
          }
        }
        if (Object.prototype.hasOwnProperty.call(patch, "value")) {
          next.auto_code = false;
        }
        return next;
      });
      return { ...current, conditions };
    });
    setFormError("");
  }

  function addPolicyCondition() {
    setForm((current) => {
      if (current.conditions.length >= 3) return current;
      const used = new Set(current.conditions.map((item) => item.field));
      const field = SNOW_RULE_FIELDS.find((item) => !used.has(item.value));
      if (!field) return current;
      return {
        ...current,
        conditions: [
          ...current.conditions,
          {
            field: field.value,
            operator: field.operators[0],
            value: field.value === "outbound_remark" ? current.outbound_code : "",
            auto_code: field.value === "outbound_remark",
          },
        ],
      };
    });
    setFormError("");
  }

  async function savePolicy() {
    setSaving(true);
    try {
      const token = await latestCsrfToken(csrfToken);
      const payload = {
        ...form,
        set_limit: form.set_limit === "" ? null : form.set_limit,
        month_target: form.month_target === "" ? null : form.month_target,
        conditions: form.conditions.map(({ auto_code, ...condition }) => condition),
      };
      await jsonFetch(
        form.id ? `/api/snow-outbound/policies/${form.id}` : "/api/snow-outbound/policies",
        {
          method: form.id ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          body: JSON.stringify(payload),
        }
      );
      Message.success(form.id ? "政策标签已更新" : "政策标签已新建");
      setFormError("");
      setFormOpen(false);
      await loadPolicies();
    } catch (error) {
      setFormError(error.message);
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePolicy(policy) {
    try {
      const token = await latestCsrfToken(csrfToken);
      await jsonFetch(`/api/snow-outbound/policies/${policy.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ enabled: !policy.enabled }),
      });
      Message.success(policy.enabled ? "政策标签已停用" : "政策标签已启用");
      await loadPolicies();
    } catch (error) {
      Message.error(error.message);
    }
  }

  async function openPolicyTerminals(policy, kind) {
    const meta = terminalListMeta[kind];
    if (!meta || !policy[meta.countField]) return;
    setTerminalListKind(kind);
    setTerminalListPolicy(policy);
    setTerminalListItems([]);
    setTerminalListOpen(true);
    setTerminalListLoading(true);
    try {
      const result = await jsonFetch(
        `/api/snow-outbound/policies/${encodeURIComponent(policy.id)}/${meta.endpoint}`
      );
      setTerminalListItems(result.items || []);
    } catch (error) {
      Message.error(error.message);
      setTerminalListOpen(false);
    } finally {
      setTerminalListLoading(false);
    }
  }

  function deletePolicy(policy) {
    Modal.confirm({
      title: "删除政策标签",
      content: `确定删除“${policy.display_name}”吗？已有终端历史标签将保留。`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          const token = await latestCsrfToken(csrfToken);
          await jsonFetch(`/api/snow-outbound/policies/${policy.id}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token },
          });
          Message.success("政策标签已删除");
          if (items.length === 1 && page > 1) setPage(page - 1);
          else await loadPolicies();
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  const formReady =
    form.name.trim() &&
    form.name.trim().length <= 10 &&
    form.outbound_code.trim() &&
    form.explanation.trim() &&
    form.explanation.trim().length <= 50 &&
    form.conditions.length >= 1 &&
    form.conditions.every((condition) => String(condition.value || "").trim()) &&
    new Set(form.conditions.map((condition) => condition.field)).size === form.conditions.length &&
    (form.set_limit === "" || /^\d+$/.test(String(form.set_limit))) &&
    (form.month_target === "" || /^\d+$/.test(String(form.month_target)));

  return (
    <div className="policy-page">
      <Card bordered className="policy-filter-card">
        <div className="policy-filter-grid">
          <Select
            value={
              filters.year && filters.month
                ? `${filters.year}-${String(filters.month).padStart(2, "0")}`
                : undefined
            }
            allowClear
            placeholder="年月"
            onChange={(value) => {
              if (!value) {
                setFilters({ ...filters, year: "", month: "" });
                return;
              }
              const [year, month] = value.split("-");
              setFilters({ ...filters, year, month: String(Number(month)) });
            }}
          >
            {monthOptions.map((month) => (
              <Option key={month} value={`2026-${String(month).padStart(2, "0")}`}>
                2026年{month}月
              </Option>
            ))}
          </Select>
          <Input
            value={filters.outbound_code}
            placeholder="出库编码搜索"
            onChange={(value) => setFilters({ ...filters, outbound_code: value })}
          />
          <Input
            value={filters.name}
            placeholder="标签名搜索"
            onChange={(value) => setFilters({ ...filters, name: value })}
            onPressEnter={() => {
              setPage(1);
              setAppliedFilters({ ...filters });
            }}
          />
          <Select
            value={filters.enabled || undefined}
            allowClear
            placeholder="是否启用"
            onChange={(value) => setFilters({ ...filters, enabled: value ?? "" })}
          >
            <Option value="true">已启用</Option>
            <Option value="false">已停用</Option>
          </Select>
          <Space>
            <Button type="primary" onClick={() => {
              setPage(1);
              setAppliedFilters({ ...filters });
            }}>查询</Button>
            <Button onClick={() => {
              setFilters({ ...EMPTY_POLICY_FILTERS });
              setPage(1);
              setAppliedFilters({ ...EMPTY_POLICY_FILTERS });
            }}>重置</Button>
          </Space>
        </div>
      </Card>

      <Card bordered className="policy-list-card">
        <div className="policy-toolbar">
          <div className="policy-toolbar-title">
            <strong>雪花政策明细</strong>
            <span>共 {total} 条</span>
          </div>
          <div className="policy-latest-upload">
            <span>雪花出库最新更新时间</span>
            {latestUploadDate ? (
              <strong className="policy-date-display" aria-label={`${latestUploadDate.year}年${latestUploadDate.month}月${latestUploadDate.day}日`}>
                <span className="policy-date-tag">{latestUploadDate.year}</span><em>年</em>
                <span className="policy-date-tag">{latestUploadDate.month}</span><em>月</em>
                <span className="policy-date-tag">{latestUploadDate.day}</span><em>日</em>
              </strong>
            ) : (
              <strong className="policy-date-empty">暂无上传记录</strong>
            )}
          </div>
          <div className="policy-toolbar-actions">
            <Button className="snow-upload-button" onClick={() => setUploadOpen(true)}>雪花出库上传</Button>
            <Button className="policy-add-button" type="primary" onClick={openPolicyCreate}>新增政策标签</Button>
          </div>
        </div>
        <Status status={status} />
        <div className="policy-table-wrap">
          <table className="policy-table">
            <thead>
              <tr>
                <th>年月</th>
                <th>启用</th>
                <th>标签名</th>
                <th>出库编码</th>
                <th>月目标</th>
                <th>已出库</th>
                <th>已拍照</th>
                <th>待出库</th>
                <th>出库解释</th>
                <th>是否拍照</th>
                <th>套数限制</th>
                <th>标签ID</th>
                <th>命中条件</th>
                <th>新建人</th>
                <th>新建时间</th>
                <th className="policy-actions-sticky">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((policy) => (
                <tr key={policy.id}>
                  <td>{policy.year}年{policy.month}月</td>
                  <td>
                    <Switch
                      size="small"
                      checked={policy.enabled}
                      checkedText="启用"
                      uncheckedText="停用"
                      onChange={() => togglePolicy(policy)}
                    />
                  </td>
                  <td>
                    <TableEllipsis value={policy.display_name} maxWidth={150}>
                      <span className={`policy-tag ${policyColorClass(policy.color)}`}>
                        {policy.display_name}
                      </span>
                    </TableEllipsis>
                  </td>
                  <td><span className="policy-code">{policy.outbound_code}</span></td>
                  <td>{policy.month_target ?? "-"}</td>
                  <td>
                    <Button
                      className="policy-stat-button policy-stat-shipped"
                      type="text"
                      size="small"
                      disabled={!policy.shipped_count}
                      onClick={() => openPolicyTerminals(policy, "shipped")}
                    >
                      {policy.shipped_count ?? 0}
                    </Button>
                  </td>
                  <td>
                    <Button
                      className="policy-stat-button policy-stat-photographed"
                      type="text"
                      size="small"
                      disabled={!policy.photographed_count}
                      onClick={() => openPolicyTerminals(policy, "photographed")}
                    >
                      {policy.photographed_count ?? 0}
                    </Button>
                  </td>
                  <td>
                    <Button
                      className="policy-stat-button policy-stat-pending"
                      type="text"
                      size="small"
                      disabled={!policy.pending_outbound_count}
                      onClick={() => openPolicyTerminals(policy, "pending")}
                    >
                      {policy.pending_outbound_count ?? 0}
                    </Button>
                  </td>
                  <td>
                    <TableEllipsis
                      value={policy.explanation}
                      className="policy-explanation"
                      maxWidth={240}
                    />
                  </td>
                  <td>{policy.requires_photo ? <Tag color="green">是</Tag> : <Tag color="gray">否</Tag>}</td>
                  <td>{policy.set_limit ?? "-"}</td>
                  <td>
                    <TableEllipsis
                      value={policy.id}
                      className="policy-id"
                      maxWidth={150}
                    />
                  </td>
                  <td>
                    <Tooltip
                      position="top"
                      content={policy.conditions.map((condition) => {
                        const field = SNOW_RULE_FIELDS.find((item) => item.value === condition.field);
                        return `${field?.label || condition.field} ${SNOW_RULE_OPERATORS[condition.operator]} ${condition.value}`;
                      }).join(" 且 ")}
                    >
                      <span className="policy-condition-summary">
                        {policy.conditions.map((condition) => {
                          const field = SNOW_RULE_FIELDS.find((item) => item.value === condition.field);
                          return `${field?.label || condition.field}${SNOW_RULE_OPERATORS[condition.operator]}${condition.value}`;
                        }).join("；")}
                      </span>
                    </Tooltip>
                  </td>
                  <td>
                    <TableEllipsis value={policy.created_by_name} maxWidth={110} />
                  </td>
                  <td>{formatCompactDateTime(policy.created_at)}</td>
                  <td className="policy-actions-sticky">
                    <span className="customer-action-links">
                      <button className="customer-action-link edit" type="button" onClick={() => openPolicyEdit(policy)}>编辑</button>
                      {isAdmin ? <button className="customer-action-link delete" type="button" onClick={() => deletePolicy(policy)}>删除</button> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !items.length ? <div className="policy-empty">暂无政策标签</div> : null}
          {loading ? <div className="customer-loading"><Spin size={30} /></div> : null}
        </div>
        <div className="customer-pagination">
          <span>每页</span>
          <Select size="small" value={pageSize} onChange={(value) => {
            setPage(1);
            setPageSize(value);
          }}>
            {CUSTOMER_OPTIONS.pageSizes.map((size) => <Option key={size} value={size}>{size} 条</Option>)}
          </Select>
          <Pagination current={page} pageSize={pageSize} total={total} size="small" onChange={setPage} />
        </div>
      </Card>

      <TerminalListModal
        visible={terminalListOpen}
        title={`${terminalListMeta[terminalListKind].title} · ${terminalListPolicy?.display_name || ""}`}
        terminals={terminalListItems}
        loading={terminalListLoading}
        summaryLabel={terminalListMeta[terminalListKind].summaryLabel}
        emptyText={terminalListMeta[terminalListKind].emptyText}
        onClose={() => setTerminalListOpen(false)}
      />

      <Modal
        title={form.id ? `编辑标签｜${form.id}` : "新增雪花出库政策标签"}
        visible={formOpen}
        onCancel={() => {
          setFormError("");
          setFormOpen(false);
        }}
        onOk={savePolicy}
        okText={form.id ? "保存修改" : "新增"}
        okButtonProps={{ loading: saving, disabled: !formReady }}
        className="policy-form-modal"
        unmountOnExit
      >
        <div className="policy-form-grid">
          <div>
            <label><i>*</i>政策月份</label>
            <Select
              value={`2026-${String(form.month).padStart(2, "0")}`}
              onChange={(value) => {
                const month = Number(value.split("-")[1]);
                updatePolicyForm({ year: 2026, month });
              }}
            >
              {monthOptions.map((month) => (
                <Option key={month} value={`2026-${String(month).padStart(2, "0")}`}>
                  2026年{month}月
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <label>月目标</label>
            <Input
              value={String(form.month_target)}
              placeholder="选填，非负整数"
              onChange={(value) => updatePolicyForm({ month_target: value.replace(/\D/g, "") })}
            />
          </div>
          <div>
            <label className="policy-name-label">
              <span><i>*</i>标签名字</span>
              <small>展示为：{form.month}月-{form.name || "标签名字"}</small>
            </label>
            <Input value={form.name} maxLength={10} showWordLimit placeholder="不超过10个字" onChange={(value) => updatePolicyForm({ name: value })} />
          </div>
          <div>
            <label><i>*</i>出库编码</label>
            <Input value={form.outbound_code} maxLength={100} onChange={setOutboundCode} />
          </div>
          <div className="full-row">
            <label><i>*</i>出库解释</label>
            <Input value={form.explanation} maxLength={50} showWordLimit onChange={(value) => updatePolicyForm({ explanation: value })} />
          </div>
          <div>
            <label>是否拍照</label>
            <Checkbox checked={form.requires_photo} onChange={(checked) => updatePolicyForm({ requires_photo: checked })}>需要拍照</Checkbox>
          </div>
          <div>
            <label>套数限制</label>
            <Input value={String(form.set_limit)} placeholder="选填，非负整数" onChange={(value) => updatePolicyForm({ set_limit: value.replace(/\D/g, "") })} />
          </div>
        </div>

        <div className="policy-condition-editor">
          <div className="policy-condition-title">
            <div><strong>命中条件</strong><span>同一字段只能定义一次，组合条件全部成立才命中</span></div>
            <Button className="policy-add-condition" size="small" disabled={form.conditions.length >= 3} onClick={addPolicyCondition}>添加条件</Button>
          </div>
          {form.conditions.map((condition, index) => {
            const usedFields = new Set(form.conditions.map((item) => item.field));
            const field = SNOW_RULE_FIELDS.find((item) => item.value === condition.field);
            return (
              <div className="policy-condition-row" key={`${condition.field}-${index}`}>
                <span>{index ? "并且" : "当"}</span>
                <Select value={condition.field} onChange={(value) => updatePolicyCondition(index, { field: value })}>
                  {SNOW_RULE_FIELDS
                    .filter((option) => option.value === condition.field || !usedFields.has(option.value))
                    .map((option) => <Option key={option.value} value={option.value}>{option.label}</Option>)}
                </Select>
                <Select value={condition.operator} onChange={(value) => updatePolicyCondition(index, { operator: value })}>
                  {(field?.operators || []).map((operator) => <Option key={operator} value={operator}>{SNOW_RULE_OPERATORS[operator]}</Option>)}
                </Select>
                <Input value={String(condition.value ?? "")} placeholder={condition.field === "converted_boxes" ? "输入数值" : "输入匹配内容"} onChange={(value) => updatePolicyCondition(index, { value })} />
                <button
                  className="policy-remove-condition"
                  type="button"
                  title="移除条件"
                  aria-label="移除条件"
                  disabled={form.conditions.length <= 1}
                  onClick={() => updatePolicyForm({
                    conditions: form.conditions.filter((_item, position) => position !== index),
                  })}
                >×</button>
              </div>
            );
          })}
        </div>
        {formError ? (
          <Alert
            className="policy-form-error"
            type="error"
            showIcon
            content={`${form.id ? "保存" : "新增"}失败：${formError}`}
          />
        ) : null}
      </Modal>

      <SnowOutboundUploadModal
        visible={uploadOpen}
        csrfToken={csrfToken}
        onClose={() => setUploadOpen(false)}
        onImported={async () => {
          setPage(1);
          await loadPolicies();
        }}
      />
    </div>
  );
}

const EMPTY_USER_FORM = {
  id: null,
  username: "",
  display_name: "",
  password: "",
  role: "user",
  status: "enabled",
};

function UserManagement({ csrfToken }) {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [saving, setSaving] = useState(false);

  async function latestCsrfToken() {
    try {
      const nextSession = await jsonFetch("/api/session");
      return nextSession.csrf_token || csrfToken;
    } catch {
      return csrfToken;
    }
  }

  async function loadUsers() {
    try {
      const data = await jsonFetch("/api/users");
      setUsers(data.items || []);
      setStatus(null);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function openCreate() {
    setForm(EMPTY_USER_FORM);
    setModalOpen(true);
  }

  function openEdit(user) {
    setForm({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      password: "",
      role: user.role,
      status: user.status,
      is_super_admin: user.is_super_admin,
    });
    setModalOpen(true);
  }

  async function saveUser() {
    setSaving(true);
    try {
      const token = await latestCsrfToken();
      const payload = {
        username: form.username,
        display_name: form.display_name,
        password: form.password,
        role: form.role,
        status: form.status,
        csrf_token: token,
      };
      if (form.id) {
        await jsonFetch(`/api/users/${form.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          body: JSON.stringify(payload),
        });
        Message.success("用户已更新");
      } else {
        await jsonFetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          body: JSON.stringify(payload),
        });
        Message.success("用户已新增");
      }
      setModalOpen(false);
      await loadUsers();
    } catch (error) {
      Message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteUser(user) {
    Modal.confirm({
      title: "删除用户",
      content: `确定删除账号 ${user.username} 吗？`,
      okText: "删除",
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          const token = await latestCsrfToken();
          await jsonFetch(`/api/users/${user.id}`, {
            method: "DELETE",
            headers: { "X-CSRF-Token": token },
          });
          Message.success("用户已删除");
          await loadUsers();
        } catch (error) {
          Message.error(error.message);
        }
      },
    });
  }

  const canSave = form.username.trim() && (form.id || form.password.trim());

  return (
    <div className="user-page">
      <Card bordered className="user-card">
        <div className="user-toolbar">
          <Button type="primary" onClick={openCreate}>
            新增用户
          </Button>
        </div>
        <Status status={status} />
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>用户名称</th>
                <th>角色</th>
                <th>状态</th>
                <th>最近登录</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="user-account-cell">
                      <TableEllipsis value={user.username} maxWidth={150}>
                        <Text bold>{user.username}</Text>
                      </TableEllipsis>
                      {user.is_super_admin ? <Tag color="gold">超级管理员</Tag> : null}
                    </span>
                  </td>
                  <td>
                    <TableEllipsis value={user.display_name} maxWidth={160} />
                  </td>
                  <td>{user.role === "admin" ? "管理员" : "普通用户"}</td>
                  <td>
                    <Tag color={user.status === "enabled" ? "green" : "gray"}>
                      {user.status === "enabled" ? "启用" : "禁用"}
                    </Tag>
                  </td>
                  <td>{user.last_login_at || "-"}</td>
                  <td>{user.created_at}</td>
                  <td>
                    <Space>
                      <Button size="small" onClick={() => openEdit(user)}>
                        编辑
                      </Button>
                      <Button
                        size="small"
                        status="danger"
                        disabled={user.is_super_admin}
                        onClick={() => deleteUser(user)}
                      >
                        删除
                      </Button>
                    </Space>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        title={form.id ? "编辑用户" : "新增用户"}
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveUser}
        okButtonProps={{ loading: saving, disabled: !canSave }}
        okText={form.id ? "保存" : "新增"}
        className="user-modal"
        unmountOnExit
      >
        <div className="user-form">
          <label>账号</label>
          <Input
            value={form.username}
            disabled={Boolean(form.id)}
            placeholder="登录账号"
            onChange={(value) => setForm({ ...form, username: value })}
          />
          <label>用户名称</label>
          <Input
            value={form.display_name}
            placeholder="用户名称"
            onChange={(value) => setForm({ ...form, display_name: value })}
          />
          <label>{form.id ? "重置密码" : "初始密码"}</label>
          <Input
            value={form.password}
            type="password"
            placeholder={form.id ? "不填写则不修改密码" : "至少 6 位"}
            onChange={(value) => setForm({ ...form, password: value })}
          />
          <div className="user-form-grid">
            <div>
              <label>角色</label>
              <Select
                value={form.role}
                disabled={form.is_super_admin}
                onChange={(value) => setForm({ ...form, role: value })}
              >
                <Option value="user">普通用户</Option>
                <Option value="admin">管理员</Option>
              </Select>
            </div>
            <div>
              <label>状态</label>
              <Select
                value={form.status}
                disabled={form.is_super_admin}
                onChange={(value) => setForm({ ...form, status: value })}
              >
                <Option value="enabled">启用</Option>
                <Option value="disabled">禁用</Option>
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function App() {
  const [session, setSession] = useState({ user: "", display_name: "", csrf_token: "", is_admin: false });
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState("library");
  const [customerSection, setCustomerSection] = useState("terminals");
  const [libraryMonths, setLibraryMonths] = useState([]);
  const [activeLibraryMonth, setActiveLibraryMonth] = useState("");

  async function loadSession() {
    try {
      setSession(await jsonFetch("/api/session"));
    } catch {
      window.location.href = "/login";
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  function updateLibraryMonths(months) {
    const nextMonths = Array.isArray(months) ? months : [];
    setLibraryMonths(nextMonths);
    setActiveLibraryMonth((current) => {
      if (current && nextMonths.includes(current)) return current;
      return nextMonths[0] || "";
    });
  }

  const pageTitle =
    activePage === "users"
      ? "权限管理"
      : activePage === "customers"
        ? customerSection === "policies" ? "雪花出库政策" : "终端明细"
        : "CRM图片处理";
  const displayName = session.display_name || session.user || "用户";

  return (
    <ConfigProvider>
      <Layout className="app-shell">
        <Sider className={collapsed ? "app-sider collapsed" : "app-sider"} width={220}>
          <div className="sider-brand">
            <BrandMark />
            {!collapsed ? (
              <div className="brand-copy">
                <Text bold>贵州鑫向晨商贸工作台</Text>
              </div>
            ) : null}
          </div>
          <nav className="side-nav">
            <button
              type="button"
              className={activePage === "library" ? "nav-item active" : "nav-item"}
              title={collapsed ? "CRM图片处理" : undefined}
              onClick={() => setActivePage("library")}
            >
              <NavIcon type="library" />
              {!collapsed ? (
                <span className="nav-copy">
                  <span>CRM图片处理</span>
                </span>
              ) : null}
            </button>
            {activePage === "library" && !collapsed && libraryMonths.length ? (
              <div className="sub-nav">
                {libraryMonths.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={activeLibraryMonth === value ? "sub-nav-item active" : "sub-nav-item"}
                    onClick={() => setActiveLibraryMonth(value)}
                  >
                    {value.replace("-", "")}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className={activePage === "customers" ? "nav-item active" : "nav-item"}
              title={collapsed ? "客户档案" : undefined}
              onClick={() => setActivePage("customers")}
            >
              <NavIcon type="customers" />
              {!collapsed ? (
                <span className="nav-copy">
                  <span>客户档案</span>
                </span>
              ) : null}
            </button>
            {activePage === "customers" && !collapsed ? (
              <div className="sub-nav customer-sub-nav">
                <button
                  type="button"
                  className={customerSection === "terminals" ? "sub-nav-item active" : "sub-nav-item"}
                  onClick={() => setCustomerSection("terminals")}
                >
                  终端明细
                </button>
                <button
                  type="button"
                  className={customerSection === "policies" ? "sub-nav-item active" : "sub-nav-item"}
                  onClick={() => setCustomerSection("policies")}
                >
                  雪花出库政策
                </button>
              </div>
            ) : null}
            {session.is_admin ? (
              <button
                type="button"
                className={activePage === "users" ? "nav-item active" : "nav-item"}
                title={collapsed ? "权限管理" : undefined}
                onClick={() => setActivePage("users")}
              >
                <NavIcon type="users" />
                {!collapsed ? (
                  <span className="nav-copy">
                    <span>权限管理</span>
                  </span>
                ) : null}
              </button>
            ) : null}
          </nav>
          <div className="sider-toggle">
            <Button
              className="sider-toggle-button"
              type="secondary"
              title={collapsed ? "展开侧边栏" : "收起侧边栏"}
              onClick={() => setCollapsed((value) => !value)}
            >
              <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
            </Button>
          </div>
        </Sider>
        <Layout className="workspace-layout">
          <Header className="app-header">
            <div className="header-inner">
              <div className="top-title">{pageTitle}</div>
              <Space className="header-actions">
                <Text type="secondary">欢迎您</Text>
                <Tag color="green">{displayName}</Tag>
                <Button type="text" href="/logout">
                  退出
                </Button>
              </Space>
            </div>
          </Header>
          <Content
            className={
              activePage === "library"
                ? "app-content library-content"
                : activePage === "customers"
                  ? "app-content customer-content"
                  : "app-content"
            }
          >
            {activePage === "users" ? (
              <UserManagement csrfToken={session.csrf_token} />
            ) : activePage === "customers" ? (
              customerSection === "policies" ? (
                <SnowPolicyManagement
                  csrfToken={session.csrf_token}
                  isAdmin={session.is_admin}
                />
              ) : (
                <CustomerManagement
                  csrfToken={session.csrf_token}
                  isAdmin={session.is_admin}
                  currentUser={session.user}
                />
              )
            ) : (
              <ImageLibrary
                csrfToken={session.csrf_token}
                activeMonth={activeLibraryMonth}
                onMonthsChange={updateLibraryMonths}
              />
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
