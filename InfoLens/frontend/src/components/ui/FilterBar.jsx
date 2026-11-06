/** 统一筛选：按 row 分行，width/weight 作为比例权重；条件组不拆散，末行提供查询与重置。 */
import React from "../../lib/react.js";
import { Button, DatePicker, Input, Select, Space, Tag } from "../../lib/arco.js";

const { Option } = Select;
const popupContainer = () => document.body;

function normalizeOption(option) {
  if (option == null) return { value: option, label: String(option ?? "") };
  if (typeof option === "object") return {
    value: option.value ?? option.id,
    label: option.label ?? option.display_name ?? option.name ?? String(option.value ?? option.id ?? ""),
  };
  return { value: option, label: String(option) };
}

export function sameFilterValue(left, right) {
  if (left === right) return true;
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]);
}

export function groupFilterFields(fields) {
  const rows = new Map();
  for (const field of fields) {
    const row = field.row ?? 0;
    if (!rows.has(row)) rows.set(row, []);
    const groups = rows.get(row);
    const last = groups[groups.length - 1];
    if (field.group && last?.name === field.group) last.fields.push(field);
    else groups.push({ name: field.group || field.name, fields: [field] });
  }
  return [...rows.values()];
}
const weight = (field) => Number(field.weight || field.width || 180);
const columns = (weights) => weights.map((value) => `minmax(0, ${value}fr)`).join(' ');

export function FilterBar({ fields = [], values = {}, onChange, onSearch, onReset,
  loading = false, showActions = true, className = "" }) {
  const rows = groupFilterFields(fields);
  function setValue(name, value) { onChange?.({ ...values, [name]: value }); }
  function renderField(field) {
    const name = field.name;
    const common = { placeholder: field.placeholder, 'aria-label': field.label,
      className: field.className, disabled: field.disabled };
    const value = values[name];
    let control;
    if (field.type === 'date-range') {
      control = <DatePicker.RangePicker {...common} value={value || []}
        placeholder={field.placeholders || ['单据开始日期', '单据结束日期']} format="YYYY-MM-DD"
        allowClear getPopupContainer={popupContainer} onChange={(next) => setValue(name, next || [])} />;
    } else if (field.type === 'month') {
      control = <DatePicker.MonthPicker {...common} value={value || undefined} allowClear
        getPopupContainer={popupContainer} onChange={(next) => setValue(name, next || '')} />;
    } else if (field.type === 'select' || field.type === 'multi-select') {
      const multiple = field.type === 'multi-select';
      control = <Select {...common} mode={multiple ? 'multiple' : undefined}
        value={multiple ? value || [] : value === '' || value == null ? undefined : value}
        allowClear={field.allowClear !== false} showSearch={field.showSearch}
        filterOption={field.filterOption} renderFormat={field.renderFormat}
        maxTagCount={multiple ? {
          count: field.maxTagCount ?? 'responsive',
          render: (count) => <Tag className="filter-overflow-count">+{count}</Tag>,
          popoverProps: { getPopupContainer: popupContainer },
        } : undefined}
        getPopupContainer={popupContainer}
        onChange={(next) => setValue(name, next ?? (multiple ? [] : ''))}>
        {(field.options || []).map((option) => {
          const normalized = normalizeOption(option);
          return <Option key={normalized.value} value={normalized.value}>{normalized.label}</Option>;
        })}
      </Select>;
    } else {
      control = <Input {...common} value={value ?? ''} maxLength={field.maxLength}
        onChange={(next) => setValue(name, next)} onPressEnter={onSearch} />;
    }
    return <div key={name} className={`filter-field filter-field-${field.type}`}>{control}</div>;
  }
  return <div className={`filter-bar ${className}`.trim()}>
    {rows.map((groups, index) => {
      const actions = showActions && index === rows.length - 1;
      return <div className={`filter-bar-row ${actions ? 'filter-bar-row-actions' : ''}`} key={index}>
        <div className="filter-bar-grid" style={{ "--filter-columns": columns(groups.map((group) =>
          group.fields[0].groupWeight || group.fields.reduce((sum, field) => sum + weight(field), 0))) }}>
          {groups.map((group) => group.fields.length > 1
            ? <div key={group.name} role="group" aria-label={group.fields.map((field) => field.label).join(' / ')}
                className={`filter-field-group ${group.name}`} style={{ "--filter-group-columns": columns(group.fields.map(weight)) }}>
                {group.fields.map(renderField)}
              </div>
            : renderField(group.fields[0]))}
        </div>
        {actions ? <Space className="filter-bar-actions">
          <Button type="primary" loading={loading} onClick={onSearch}>查询</Button>
          <Button onClick={onReset}>重置</Button>
        </Space> : null}
      </div>;
    })}
  </div>;
}
export default FilterBar;
