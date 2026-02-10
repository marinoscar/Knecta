import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getDataTableComponents } from '../../../components/data-agent/DataTable';

function renderMarkdownTable(markdown: string) {
  return render(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={getDataTableComponents()}>
      {markdown}
    </ReactMarkdown>
  );
}

describe('DataTable', () => {
  it('should render a markdown table as MUI Table', () => {
    const { container } = renderMarkdownTable(`
| Name | Age |
|------|-----|
| Alice | 30 |
    `);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('should wrap table in MUI TableContainer', () => {
    const { container } = renderMarkdownTable(`
| Col1 | Col2 |
|------|------|
| A | B |
    `);

    const tableContainer = container.querySelector('.MuiTableContainer-root');
    expect(tableContainer).toBeInTheDocument();
  });

  it('should show row count footer with correct count', () => {
    renderMarkdownTable(`
| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
| Charlie | 35 |
    `);

    expect(screen.getByText('3 rows')).toBeInTheDocument();
  });

  it('should show singular "1 row" for single row', () => {
    renderMarkdownTable(`
| Name |
|------|
| Alice |
    `);

    expect(screen.getByText('1 row')).toBeInTheDocument();
  });

  it('should handle single-column table', () => {
    const { container } = renderMarkdownTable(`
| ID |
|----|
| 1 |
| 2 |
    `);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('2 rows')).toBeInTheDocument();
  });

  it('should render header cells in table head', () => {
    const { container } = renderMarkdownTable(`
| Name | Age |
|------|-----|
| Alice | 30 |
    `);

    const thead = container.querySelector('thead');
    expect(thead).toBeInTheDocument();

    const headerCells = thead?.querySelectorAll('th');
    expect(headerCells?.length).toBe(2);
  });

  it('should render body cells in table body', () => {
    const { container } = renderMarkdownTable(`
| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
    `);

    const tbody = container.querySelector('tbody');
    expect(tbody).toBeInTheDocument();

    const rows = tbody?.querySelectorAll('tr');
    expect(rows?.length).toBe(2);
  });

  it('should render multiple tables independently', () => {
    const { container } = renderMarkdownTable(`
| Table1 |
|--------|
| A |

Some text

| Table2 |
|--------|
| B |
| C |
    `);

    const tables = container.querySelectorAll('table');
    expect(tables.length).toBe(2);

    // Both should have row counts
    expect(screen.getByText('1 row')).toBeInTheDocument();
    expect(screen.getByText('2 rows')).toBeInTheDocument();
  });
});
