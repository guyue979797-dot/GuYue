/**
 * 产品档案详情（命令式 Modal.info，仅展示）。
 */
import { Modal } from "../../lib/arco.js";

export function showProductDetail(product) {
  Modal.info({
    title: `产品档案详情 · ${product.short_name || product.product_name}`,
    width: 560,
    content: (
      <div className="record-detail-grid">
        <div><strong>商品简称</strong><span>{product.short_name || "待补充"}</span></div>
        <div><strong>档案状态</strong><span>{product.status || "-"}</span></div>
        <div><strong>商品名称</strong><span>{product.product_name || "-"}</span></div>
        <div><strong>雪花库存</strong><span>{product.snow_inventory ?? 0} 箱</span></div>
        <div><strong>结算价</strong><span>{product.settlement_price == null ? "-" : `¥ ${Number(product.settlement_price).toFixed(2)}`}</span></div>
        <div><strong>规格</strong><span>{product.specification && product.auxiliary_unit ? `1箱 = ${product.specification}${product.auxiliary_unit}` : "待补充"}</span></div>
        <div><strong>商品编码</strong><span>{(product.product_codes || []).join("、") || "-"}</span></div>
        <div><strong>管家婆编码</strong><span>{(product.housekeeper_codes || []).join("、") || "-"}</span></div>
      </div>
    ),
  });
}
