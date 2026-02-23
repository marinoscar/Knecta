import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { FileUploadZone } from '../../../components/spreadsheet-agent/FileUploadZone';

describe('FileUploadZone', () => {
  const mockOnFilesSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders drop zone text', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);
      expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument();
    });

    it('renders supported file types hint', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);
      expect(screen.getByText(/excel.*csv.*tsv.*json/i)).toBeInTheDocument();
    });

    it('renders file input element', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
    });

    it('renders disabled state with disabled input', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} disabled />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeDisabled();
    });
  });

  describe('File selection', () => {
    it('calls onFilesSelected when a valid xlsx file is added', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
    });

    it('calls onFilesSelected when a valid csv file is added', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['col1,col2\n1,2'], 'data.csv', { type: 'text/csv' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
    });

    it('calls onFilesSelected when a valid json file is added', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['[{"a":1}]'], 'records.json', { type: 'application/json' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
    });

    it('displays selected file name in list after selection', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test content'], 'data.csv', { type: 'text/csv' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByText('data.csv')).toBeInTheDocument();
    });

    it('displays multiple selected files', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file1 = new File(['a'], 'first.csv', { type: 'text/csv' });

      fireEvent.change(input, { target: { files: [file1] } });

      expect(screen.getByText('first.csv')).toBeInTheDocument();
    });
  });

  describe('File removal', () => {
    it('removes a file from the list when delete button is clicked', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'remove-me.csv', { type: 'text/csv' });

      fireEvent.change(input, { target: { files: [file] } });
      expect(screen.getByText('remove-me.csv')).toBeInTheDocument();

      // Find and click the delete button
      const deleteButton = screen.getByRole('button');
      fireEvent.click(deleteButton);

      expect(screen.queryByText('remove-me.csv')).not.toBeInTheDocument();
    });

    it('calls onFilesSelected with empty array after removing the only file', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'solo.csv', { type: 'text/csv' });

      fireEvent.change(input, { target: { files: [file] } });
      mockOnFilesSelected.mockClear();

      const deleteButton = screen.getByRole('button');
      fireEvent.click(deleteButton);

      expect(mockOnFilesSelected).toHaveBeenCalledWith([]);
    });
  });

  describe('File validation', () => {
    it('shows error alert for unsupported file types', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'virus.exe', { type: 'application/x-msdownload' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
    });

    it('does not add an unsupported file to the list', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'report.pdf', { type: 'application/pdf' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
      expect(mockOnFilesSelected).not.toHaveBeenCalled();
    });

    it('shows error for files exceeding the size limit', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Create a file object with a large reported size
      const file = new File(['x'], 'huge.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 }); // 600 MB

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByText(/exceeds.*mb limit/i)).toBeInTheDocument();
    });

    it('does not add an oversized file to the list', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['x'], 'big.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 });

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.queryByText('big.csv')).not.toBeInTheDocument();
      expect(mockOnFilesSelected).not.toHaveBeenCalled();
    });

    it('shows error for duplicate files', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['same content'], 'dup.csv', { type: 'text/csv' });

      // Add the file once
      fireEvent.change(input, { target: { files: [file] } });
      mockOnFilesSelected.mockClear();

      // Try to add the same file again (same name + size)
      const duplicate = new File(['same content'], 'dup.csv', { type: 'text/csv' });
      fireEvent.change(input, { target: { files: [duplicate] } });

      expect(screen.getByText(/already added/i)).toBeInTheDocument();
      // onFilesSelected should not be called again with the duplicate
      expect(mockOnFilesSelected).not.toHaveBeenCalled();
    });

    it('does not call onFilesSelected when all files are invalid', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const badFile = new File(['x'], 'doc.docx', { type: 'application/msword' });

      fireEvent.change(input, { target: { files: [badFile] } });

      expect(mockOnFilesSelected).not.toHaveBeenCalled();
    });
  });

  describe('Disabled state', () => {
    it('renders with disabled input when disabled prop is true', () => {
      render(<FileUploadZone onFilesSelected={mockOnFilesSelected} disabled />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it('delete buttons are disabled when component is disabled', () => {
      const { rerender } = render(
        <FileUploadZone onFilesSelected={mockOnFilesSelected} />,
      );

      // First add a file while enabled
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      fireEvent.change(input, { target: { files: [file] } });

      // Now disable
      rerender(<FileUploadZone onFilesSelected={mockOnFilesSelected} disabled />);

      const deleteButton = screen.getByRole('button');
      expect(deleteButton).toBeDisabled();
    });
  });
});
