/**
 * 全屏图片预览（Esc 关闭、焦点返回由上层保证）。
 */
import React, { useEffect } from "../../lib/react.js";
import { ImageArchiveBadges } from "../../components/business/ImageArchiveBadges.jsx";

export function ImagePreview({ image, onClose, onRemoveTag }) {
  useEffect(() => {
    if (!image) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      className="fullscreen-preview"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button className="fullscreen-close" type="button" onClick={onClose}>
        关闭
      </button>
      <img
        className="fullscreen-image"
        src={image.url}
        alt={image.filename || "图片预览"}
        onClick={(event) => event.stopPropagation()}
      />
      <ImageArchiveBadges
        tags={image.archive_tags || []}
        expanded
        onRemove={onRemoveTag}
      />
    </div>
  );
}

export default ImagePreview;
