/**
 * 单链接图片提取。
 */
import React, { useState } from "../../lib/react.js";
import { Button, Input } from "../../lib/arco.js";
import { StatusAlert } from "../../components/ui/StatusAlert.jsx";
import { extractSingle } from "../../api/photos.js";

export function SingleExtract({ onRefreshResults }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const canSubmit = Boolean(url.trim()) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setStatus({ type: "info", message: "正在读取拜访信息并下载图片，请稍候" });
    try {
      const data = await extractSingle(url.trim());
      setUrl("");
      setStatus({ type: "success", message: `完成：已提取 ${data.images.length} 张图片` });
      await onRefreshResults?.();
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
      <StatusAlert status={status} />
    </div>
  );
}

export default SingleExtract;
