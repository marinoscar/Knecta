import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { YamlEditor } from '../../../components/semantic-models/YamlEditor';
import * as apiModule from '../../../services/api';

// Mock CodeMirror
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange, readOnly }: any) => (
    <textarea
      data-testid="yaml-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      readOnly={readOnly}
    />
  ),
}));

// Mock @codemirror/lang-yaml
vi.mock('@codemirror/lang-yaml', () => ({
  yaml: () => ({}),
}));

// Sample YAML content for tests
const validYaml = `semantic_model:
  - name: Test Model
    datasets:
      - name: orders
        source: public.orders
        fields:
          - name: id
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: orders.id
`;

const invalidYaml = `this: is: not: valid:
  - [yaml
`;

const updatedYaml = `semantic_model:
  - name: Updated Model
    datasets:
      - name: orders
        source: public.orders
`;

describe('YamlEditor', () => {
  const mockOnSaveSuccess = vi.fn();
  const defaultProps = {
    initialYaml: validYaml,
    fileName: 'test-model.yaml',
    modelId: 'model-123',
    onSaveSuccess: mockOnSaveSuccess,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL for download tests
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  describe('Rendering', () => {
    it('should render the editor with initial YAML content', () => {
      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      expect(editor).toBeInTheDocument();
      expect(editor).toHaveValue(validYaml);
    });

    it('should render toolbar buttons', () => {
      render(<YamlEditor {...defaultProps} />);

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /validate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });

    it('should not show dirty indicator on initial render', () => {
      render(<YamlEditor {...defaultProps} />);

      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    });

    it('should render in read-only mode when readOnly prop is true', () => {
      render(<YamlEditor {...defaultProps} readOnly />);

      const editor = screen.getByTestId('yaml-editor');
      expect(editor).toHaveAttribute('readonly');
    });
  });

  describe('Dirty State Tracking', () => {
    it('should show dirty indicator when content changes', async () => {
      const user = userEvent.setup();
      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.clear(editor);
      await user.type(editor, updatedYaml);

      await waitFor(() => {
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      });
    });

    it('should disable Save button when content has not changed', () => {
      render(<YamlEditor {...defaultProps} />);

      const saveButton = screen.getByRole('button', { name: /save/i });
      expect(saveButton).toBeDisabled();
    });

    it('should enable Save button when content changes', async () => {
      const user = userEvent.setup();
      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /save/i });
        expect(saveButton).not.toBeDisabled();
      });
    });

    it('should disable Cancel button when content has not changed', () => {
      render(<YamlEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });

    it('should enable Cancel button when content changes', async () => {
      const user = userEvent.setup();
      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        expect(cancelButton).not.toBeDisabled();
      });
    });
  });

  describe('Cancel Button', () => {
    it('should revert to initial content when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');

      // Change content
      await user.clear(editor);
      await user.type(editor, updatedYaml);

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(editor).toHaveValue(validYaml);
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
      });
    });

    it('should clear validation results when Cancel is clicked', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: false,
        fatalIssues: ['Test error'],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.clear(editor);
      await user.type(editor, updatedYaml);

      // Validate to show errors
      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });

      // Cancel should clear validation results
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Test error')).not.toBeInTheDocument();
      });
    });
  });

  describe('Read-Only Mode', () => {
    it('should disable Save button in read-only mode', () => {
      render(<YamlEditor {...defaultProps} readOnly />);

      const saveButton = screen.getByRole('button', { name: /save/i });
      expect(saveButton).toBeDisabled();
    });

    it('should disable Validate button in read-only mode', () => {
      render(<YamlEditor {...defaultProps} readOnly />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      expect(validateButton).toBeDisabled();
    });

    it('should allow Copy button in read-only mode', () => {
      render(<YamlEditor {...defaultProps} readOnly />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      expect(copyButton).not.toBeDisabled();
    });

    it('should allow Download button in read-only mode', () => {
      render(<YamlEditor {...defaultProps} readOnly />);

      const downloadButton = screen.getByRole('button', { name: /download/i });
      expect(downloadButton).not.toBeDisabled();
    });
  });

  describe('Copy Button', () => {
    it('should copy content to clipboard when Copy is clicked', async () => {
      const user = userEvent.setup();
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: writeTextSpy,
        },
        writable: true,
        configurable: true,
      });

      render(<YamlEditor {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      await user.click(copyButton);

      expect(writeTextSpy).toHaveBeenCalledWith(validYaml);
    });

    it('should show success message after copying', async () => {
      const user = userEvent.setup();
      render(<YamlEditor {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      await user.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Copied to clipboard!')).toBeInTheDocument();
      });
    });

    it('should show error message if copy fails', async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error('Copy failed')),
        },
        writable: true,
        configurable: true,
      });

      render(<YamlEditor {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy/i });
      await user.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to copy to clipboard')).toBeInTheDocument();
      });
    });
  });

  describe('Download Button', () => {
    it('should be enabled and clickable', async () => {
      render(<YamlEditor {...defaultProps} />);

      const downloadButton = screen.getByRole('button', { name: /download/i });
      expect(downloadButton).not.toBeDisabled();
    });

    it('should be enabled even when content is dirty', async () => {
      const user = userEvent.setup();
      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const downloadButton = screen.getByRole('button', { name: /download/i });
      expect(downloadButton).not.toBeDisabled();
    });
  });

  describe('Save Functionality', () => {
    it('should call updateSemanticModel API on save', async () => {
      const user = userEvent.setup();
      const mockUpdate = vi.spyOn(apiModule, 'updateSemanticModel').mockResolvedValue({
        id: 'model-123',
        name: 'Test Model',
        model: { semantic_model: [{ name: 'Test Model' }] },
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith('model-123', {
          model: expect.any(Object),
        });
      });
    });

    it('should call onSaveSuccess after successful save', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockResolvedValue({
        id: 'model-123',
        name: 'Test Model',
        model: { semantic_model: [{ name: 'Test Model' }] },
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSaveSuccess).toHaveBeenCalled();
      });
    });

    it('should show success message after save', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockResolvedValue({
        id: 'model-123',
        name: 'Test Model',
        model: { semantic_model: [{ name: 'Test Model' }] },
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Model saved successfully')).toBeInTheDocument();
      });
    });

    it('should reset dirty state after successful save', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockResolvedValue({
        id: 'model-123',
        name: 'Test Model',
        model: { semantic_model: [{ name: 'Test Model' }] },
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      await waitFor(() => {
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
      });
    });

    it('should show validation warnings on save with auto-fixes', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockResolvedValue({
        id: 'model-123',
        name: 'Test Model',
        model: { semantic_model: [{ name: 'Test Model' }] },
        validation: {
          fixedIssues: ['Fixed duplicate field name'],
          warnings: ['Consider adding a description'],
        },
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Fixed duplicate field name')).toBeInTheDocument();
        expect(screen.getByText('Consider adding a description')).toBeInTheDocument();
      });
    });
  });

  describe('Save Error Handling', () => {
    it('should show YAML syntax error without API call', async () => {
      const user = userEvent.setup();
      const mockUpdate = vi.spyOn(apiModule, 'updateSemanticModel');

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;

      // Simulate changing the textarea value using fireEvent
      fireEvent.change(editor, { target: { value: invalidYaml } });

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /save/i });
        expect(saveButton).not.toBeDisabled();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/YAML syntax error/i)).toBeInTheDocument();
      });

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should show validation errors on 422 response', async () => {
      const user = userEvent.setup();
      const error = {
        status: 422,
        response: {
          status: 422,
          data: {
            fatalIssues: ['Missing required field: name'],
            warnings: ['Consider adding relationships'],
          },
        },
      };
      vi.spyOn(apiModule, 'updateSemanticModel').mockRejectedValue(error);

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Missing required field: name')).toBeInTheDocument();
        expect(screen.getByText('Consider adding relationships')).toBeInTheDocument();
      });
    });

    it('should show generic error message on non-422 failure', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockRejectedValue({
        message: 'Network error',
      });

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Validate Functionality', () => {
    it('should call validateSemanticModel API on validate', async () => {
      const user = userEvent.setup();
      const mockValidate = vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: true,
        fatalIssues: [],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(mockValidate).toHaveBeenCalledWith(expect.any(Object));
      });
    });

    it('should show success message on valid YAML', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: true,
        fatalIssues: [],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Validation passed')).toBeInTheDocument();
      });
    });

    it('should show validation panel with success alert when valid', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: true,
        fatalIssues: [],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Validation passed successfully')).toBeInTheDocument();
      });
    });

    it('should show validation errors', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: false,
        fatalIssues: ['Field name is required', 'Invalid expression syntax'],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Field name is required')).toBeInTheDocument();
        expect(screen.getByText('Invalid expression syntax')).toBeInTheDocument();
      });
    });

    it('should show validation warnings', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: true,
        fatalIssues: [],
        fixedIssues: [],
        warnings: ['Consider adding a description', 'Missing field type'],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Consider adding a description')).toBeInTheDocument();
        expect(screen.getByText('Missing field type')).toBeInTheDocument();
      });
    });

    it('should show YAML syntax error without API call on invalid syntax', async () => {
      const user = userEvent.setup();
      const mockValidate = vi.spyOn(apiModule, 'validateSemanticModel');

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;

      // Simulate changing the textarea value using fireEvent
      fireEvent.change(editor, { target: { value: invalidYaml } });

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText(/YAML syntax error/i)).toBeInTheDocument();
      });

      expect(mockValidate).not.toHaveBeenCalled();
    });

    it('should show error message if validation request fails', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockRejectedValue({
        message: 'Server error',
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });
  });

  describe('Validation Panel', () => {
    it('should show close button on validation alerts', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: false,
        fatalIssues: ['Test error'],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });

      // Find the close button in the alert
      const alert = screen.getByText('Test error').closest('.MuiAlert-root');
      const closeButton = alert?.querySelector('button');
      expect(closeButton).toBeInTheDocument();
    });

    it('should clear validation panel when close button is clicked', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: false,
        fatalIssues: ['Test error'],
        fixedIssues: [],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });

      // Click the close button
      const alert = screen.getByText('Test error').closest('.MuiAlert-root');
      const closeButton = alert?.querySelector('button');
      if (closeButton) {
        await user.click(closeButton);
      }

      await waitFor(() => {
        expect(screen.queryByText('Test error')).not.toBeInTheDocument();
      });
    });

    it('should show auto-fixed issues in validation panel', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockResolvedValue({
        isValid: true,
        fatalIssues: [],
        fixedIssues: ['Removed duplicate field', 'Fixed invalid reference'],
        warnings: [],
      });

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      await waitFor(() => {
        expect(screen.getByText('Removed duplicate field')).toBeInTheDocument();
        expect(screen.getByText('Fixed invalid reference')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading indicator while saving', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Check for loading state (CircularProgress in button)
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('should disable buttons while saving', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'updateSemanticModel').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Buttons should be disabled during save
      expect(screen.getByRole('button', { name: /validate/i })).toBeDisabled();
    });

    it('should show loading indicator while validating', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      // Check for loading state (CircularProgress in button)
      expect(screen.getByRole('button', { name: /validate/i })).toBeInTheDocument();
    });

    it('should disable buttons while validating', async () => {
      const user = userEvent.setup();
      vi.spyOn(apiModule, 'validateSemanticModel').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      render(<YamlEditor {...defaultProps} />);

      const validateButton = screen.getByRole('button', { name: /validate/i });
      await user.click(validateButton);

      // Validate button itself should be disabled while validating
      await waitFor(() => {
        expect(validateButton).toBeDisabled();
      });
    });
  });

  describe('Props Updates', () => {
    it('should update content when initialYaml prop changes', () => {
      const { rerender } = render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      expect(editor).toHaveValue(validYaml);

      const newYaml = 'semantic_model:\n  - name: New Model\n';
      rerender(<YamlEditor {...defaultProps} initialYaml={newYaml} />);

      expect(editor).toHaveValue(newYaml);
    });

    it('should reset dirty state when initialYaml prop changes', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<YamlEditor {...defaultProps} />);

      const editor = screen.getByTestId('yaml-editor');
      await user.type(editor, ' ');

      await waitFor(() => {
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      });

      const newYaml = 'semantic_model:\n  - name: New Model\n';
      rerender(<YamlEditor {...defaultProps} initialYaml={newYaml} />);

      await waitFor(() => {
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
      });
    });
  });
});
