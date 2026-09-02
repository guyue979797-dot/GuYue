import React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";

window.React = React;
// Arco 的 Message、Modal.confirm 等命令式组件仍调用 ReactDOM.render。
// React 19 已移除该 API，因此在全局入口提供兼容层，避免错误提示本身崩溃。
const legacyRoots = new WeakMap();
const compatibleReactDOM = { ...ReactDOM };
if (!compatibleReactDOM.render) {
  compatibleReactDOM.render = (element, container, callback) => {
    let root = legacyRoots.get(container);
    if (!root) {
      root = ReactDOMClient.createRoot(container);
      legacyRoots.set(container, root);
    }
    root.render(element);
    if (typeof callback === "function") {
      queueMicrotask(callback);
    }
    return null;
  };
}
if (!compatibleReactDOM.unmountComponentAtNode) {
  compatibleReactDOM.unmountComponentAtNode = (container) => {
    const root = legacyRoots.get(container);
    if (!root) return false;
    queueMicrotask(() => {
      root.unmount();
      legacyRoots.delete(container);
    });
    return true;
  };
}
window.ReactDOM = compatibleReactDOM;
window.ReactDOMClient = ReactDOMClient;
