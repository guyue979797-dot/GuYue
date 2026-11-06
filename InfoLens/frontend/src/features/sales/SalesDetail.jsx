import React from "../../lib/react.js";
import { Empty } from "../../lib/arco.js";
import { FormDrawer } from "../../components/ui/FormDrawer.jsx";
import { hiddenSalesFields } from "./columns.js";

export function SalesDetail({ record, fields, onClose }) {
  const hidden = hiddenSalesFields(fields);
  return <FormDrawer visible={Boolean(record)} title={`其他字段 · ${record?.values['单据编号'] || ''}`}
    onCancel={onClose} footer={null} className="sales-detail-modal">
    {hidden.length ? <dl className="sales-detail-fields">
      {hidden.map((field) => <div key={field}>
        <dt>{field}</dt>
        <dd>{record?.values[field] == null || record.values[field] === '' ? '-' : String(record.values[field])}</dd>
      </div>)}
    </dl> : <Empty description="没有其他字段" />}
  </FormDrawer>;
}
