export function TableRowActions({
  Dropdown,
  Menu,
  MenuItem,
  onDetail,
  items = [],
}) {
  return (
    <div className="row-actions">
      <button className="action-detail" type="button" onClick={onDetail}>
        详情
      </button>
      <Dropdown
        droplist={(
          <Menu>
            {items.map((item) => (
              <MenuItem
                key={item.key}
                className={item.danger ? "row-action-danger" : ""}
                disabled={item.disabled}
                onClick={item.onClick}
              >
                {item.label}
              </MenuItem>
            ))}
          </Menu>
        )}
        trigger="click"
        position="br"
        getPopupContainer={() => document.body}
      >
        <button
          className="action-kebab"
          type="button"
          aria-label="更多操作"
          title="更多操作"
        >
          ⋯
        </button>
      </Dropdown>
    </div>
  );
}
