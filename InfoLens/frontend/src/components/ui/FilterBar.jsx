/**
 * 统一筛选条（重构要求 16.4 / 原则十一）。
 * - Select 类型筛选项排在 Input 前（由 fields 顺序决定，页面负责排序）
 * - 字段内部多选值采用 OR；不同筛选字段之间采用 AND（由接口层语义决定）
 * - 查询、重置、回车提交与回到第一页由页面统一处理
 */
import React from "../../lib/react.js";
import { Button, Input, Select, Space } from "../../lib/arco.js";

const { Option } = Select;

function normalizeOption(option) {
  if (option == null) return { value: option, label: String(option ?? "") };
  if (typeof option === "object") {
    return {
      value: option.value ?? option.id,
      label: option.label ?? option.display_name ?? option.name ?? String(option.value ?? option.id ?? ""),
    };
  }
  return { value: option, label: String(option) };
}

export function FilterBar({
  fields = [],
  values = {},
  onChange,
  onSearch,
  onReset,
  loading = false,
  className = "",
}) {
  function setValue(name, value) {
    onChange?.({ ...values, [name]: value });
  }

  function renderField(field) {
    const key = field.name;
    const common = {
      key,
      placeholder: field.placeholder,
      "aria-label": field.label,
    };
    const fieldClass = `filter-field filter-field-${field.type}`;
    const fieldStyle = field.width ? { width: field.width } : undefined;
    if (field.type === "select") {
      return (
        <div className={fieldClass} style={fieldStyle}>
          <Select
            {...common}
            value={values[key] || undefined}
            allowClear={field.allowClear !== false}
            showSearch={field.showSearch}
            filterOption={field.filterOption}
            onChange={(value) => setValue(key, value ?? "")}
            className={field.className}
          >
            {(field.options || []).map((option) => {
              const normalized = normalizeOption(option);
              return (
                <Option key={normalized.value} value={normalized.value}>
                  {normalized.label}
                </Option>
              );
            })}
          </Select>
        </div>
      );
    }
    if (field.type === "multi-select") {
      return (
        <div className={fieldClass} style={fieldStyle}>
          <Select
            {...common}
            mode="multiple"
            value={values[key] || []}
            allowClear
            maxTagCount={field.maxTagCount}
            showSearch={field.showSearch}
            filterOption={field.filterOption}
            onChange={(value) => setValue(key, value || [])}
            className={field.className}
          >
            {(field.options || []).map((option) => {
              const normalized = normalizeOption(option);
              return (
                <Option key={normalized.value} value={normalized.value}>
                  {normalized.label}
                </Option>
              );
            })}
          </Select>
        </div>
      );
    }
    return (
      <div className={fieldClass} style={fieldStyle}>
        <Input
          {...common}
          value={values[key] ?? ""}
          maxLength={field.maxLength}
          onChange={(value) => setValue(key, value)}
          onPressEnter={onSearch}
          className={field.className}
        />
      </div>
    );
  }

  function renderFields() {
    const nodes = [];
    for (let index = 0; index < fields.length;) {
      const field = fields[index];
      if (!field.group) {
        nodes.push(renderField(field));
        index += 1;
        continue;
      }

      const groupedFields = [field];
      let nextIndex = index + 1;
      while (fields[nextIndex]?.group === field.group) {
        groupedFields.push(fields[nextIndex]);
        nextIndex += 1;
      }
      nodes.push(
        <div className={`filter-field-group ${field.group}`} key={`group-${field.group}`}>
          {groupedFields.map((groupedField) => renderField(groupedField))}
        </div>,
      );
      index = nextIndex;
    }
    return nodes;
  }

  return (
    <div className={`filter-bar ${className}`.trim()}>
      <div className="filter-bar-grid">
        {renderFields()}
      </div>
      <Space className="filter-bar-actions">
        <Button type="primary" loading={loading} onClick={onSearch}>
          查询
        </Button>
        <Button onClick={onReset}>重置</Button>
      </Space>
    </div>
  );
}

export default FilterBar;
