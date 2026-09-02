/**
 * 批量图片提取（可恢复任务 + 轮询）。
 * 轮询带最大时长保护与卸载保护（修复无限轮询问题）。
 */
import React, { useEffect, useRef, useState } from "../../lib/react.js";
import { Button, Card, Space, Text, Upload } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { getBatchJob, startBatchExtract } from "../../api/photos.js";
import { BATCH_JOB_STORAGE_KEY } from "./constants.js";

const POLL_INTERVAL_MS = 650;
const MAX_WAIT_MS = 60 * 60 * 1000;

function ProgressBar({ percent, completed = false, label }) {
  const normalized = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="progress-track progress-bar-track" aria-label={label}>
      <div
        className={`progress-bar progress-bar-fill ${completed ? "completed" : ""}`.trim()}
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

export function BatchExtract({ onRefreshResults }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    const startedAt = Date.now();
    while (mountedRef.current) {
      setProgress(job);
      if (job.status === "completed") {
        window.localStorage.removeItem(BATCH_JOB_STORAGE_KEY);
        return job.result;
      }
      if (job.status === "failed") {
        window.localStorage.removeItem(BATCH_JOB_STORAGE_KEY);
        throw new Error(job.error || "批量提取失败");
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error("批量提取超时，请刷新页面后重试");
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      job = await getBatchJob(jobId);
    }
    throw new Error("任务已取消");
  }

  useEffect(() => {
    const jobId = window.localStorage.getItem(BATCH_JOB_STORAGE_KEY);
    if (!jobId) return undefined;
    setBusy(true);
    setStatus({ type: "info", message: "正在恢复批量任务" });
    (async () => {
      try {
        const initialJob = await getBatchJob(jobId);
        const data = await waitForJob(jobId, initialJob);
        if (!mountedRef.current) return;
        setStatus({
          type: "success",
          message: `完成：${data.succeeded}/${data.total}，${data.image_count} 张，重试 ${data.retry_count || 0} 次`,
        });
        await onRefreshResults?.();
      } catch (error) {
        if (!mountedRef.current) return;
        if (String(error.message).includes("不存在或已过期")) {
          window.localStorage.removeItem(BATCH_JOB_STORAGE_KEY);
        }
        setStatus({ type: "error", message: error.message });
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    })();
    return undefined;
  }, []);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setStatus({ type: "info", message: "处理中" });
    try {
      const started = await startBatchExtract(file);
      window.localStorage.setItem(BATCH_JOB_STORAGE_KEY, started.job_id);
      const data = await waitForJob(started.job_id, started);
      if (!mountedRef.current) return;
      setStatus({
        type: "success",
        message: `完成：${data.succeeded}/${data.total}，${data.image_count} 张，重试 ${data.retry_count || 0} 次`,
      });
      await onRefreshResults?.();
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus({ type: "error", message: error.message });
    } finally {
      if (mountedRef.current) setBusy(false);
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
      <StatusAlert status={status} />
      {progress ? (
        <Card className="sub-card" bordered>
          <div className="batch-stats" aria-label="批量提取统计">
            {batchStats.map((item, index) => (
              <div className={`batch-stat batch-stat-${index + 1}`} key={item.label}>
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
          <ProgressBar
            percent={percent}
            completed={progress.status === "success" || percent >= 100}
            label={`批量提取进度${percent}%`}
          />
        </Card>
      ) : null}
    </div>
  );
}

export default BatchExtract;
