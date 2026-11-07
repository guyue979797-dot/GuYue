"""Export a complete month of analyzed sales, including hidden fields."""
import io
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from .sales import number

SALES_COLUMNS = json.loads(Path(__file__).with_name('sales_columns.json').read_text(encoding='utf-8'))


def build_sales_workbook(result):
    visible = {column['source'] for column in SALES_COLUMNS if column['source']}
    columns = [(column['title'], column['source']) for column in SALES_COLUMNS]
    titles = {title for title, _ in columns}
    for field in dict.fromkeys(result['columns']):
        if field in visible:
            continue
        title = field
        while title in titles:
            title = f'原始·{title}'
        columns.append((title, field))
        titles.add(title)
    if len(result['items']) > 1048575 or len(columns) > 16384:
        raise ValueError('所选月份数据超过Excel单表容量，请联系管理员处理')
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet('销售明细')
    sheet.freeze_panes = 'A2'
    for index, (title, _) in enumerate(columns, 1):
        sheet.column_dimensions[get_column_letter(index)].width = min(42, max(14, len(title) * 2 + 4))
    header = []
    for title, _ in columns:
        cell = WriteOnlyCell(sheet, title)
        cell.data_type = 's'
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='165DFF')
        header.append(cell)
    sheet.append(header)
    for item in result['items']:
        values = item['values']
        row = []
        for _, source in columns:
            value = values.get(source) if source else float(number(values.get('辅1数量')) + number(values.get('赠品辅1数量')))
            if isinstance(value, (list, dict)):
                value = json.dumps(value, ensure_ascii=False)
            cell = WriteOnlyCell(sheet, value)
            if isinstance(value, str):
                # Preserve leading zeros and formulas as literal source text.
                cell.data_type = 's'
                cell.number_format = '@'
            elif source == '利润率':
                cell.number_format = '0.00%'
            row.append(cell)
        sheet.append(row)
    sheet.auto_filter.ref = f'A1:{get_column_letter(len(columns))}{len(result["items"]) + 1}'
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
