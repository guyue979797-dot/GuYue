/** Compatibility adapter for legacy modal row markup. Layout is exclusively DataTable. */
import React, { useEffect, useMemo, useState } from '../../lib/react.js';
import { DataTable } from './DataTable.jsx';
import { TableText } from './TableText.jsx';
import { visibleText } from './tableColumnSizing.js';

const elements = children => React.Children.toArray(children).filter(child => React.isValidElement(child));
export function AdaptiveTable({ children }) {
  const [viewport, setViewport] = useState(() => window.innerHeight);
  useEffect(() => {
    const resize = () => setViewport(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const { columns, data } = useMemo(() => {
    const sections = elements(children);
    const headers = elements(elements(sections.find(section => section.type === 'thead')?.props.children)[0]?.props.children);
    const rows = elements(sections.find(section => section.type === 'tbody')?.props.children);
    const data = rows.map((row, index) => ({ id: row.key || index, cells: elements(row.props.children).map(cell => cell.props.children) }));
    const columns = headers.map((header, index) => ({
      key: `${index}:${visibleText(header.props.children)}`, title: header.props.children,
      render: (_, record) => {
        const cell = record.cells[index];
        return typeof cell === 'string' || typeof cell === 'number' ? <TableText value={cell} /> : cell;
      },
    }));
    return { columns, data };
  }, [children]);
  return <DataTable className="adaptive-table" columns={columns} data={data} scrollY={Math.max(140, Math.min(320, viewport - 360))} />;
}
