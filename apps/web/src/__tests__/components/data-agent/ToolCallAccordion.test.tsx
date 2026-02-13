import { describe, it, expect } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { ToolCallAccordion } from '../../../components/data-agent/ToolCallAccordion';
import type { DataAgentStreamEvent } from '../../../types';

describe('ToolCallAccordion', () => {
  describe('Empty State', () => {
    it('renders nothing when no tool events', () => {
      const events: DataAgentStreamEvent[] = [];
      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when events contain no tool-related events', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'message_start' },
        { type: 'text', content: 'Some text' },
        { type: 'message_complete' },
      ];
      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Tool Call Events (Legacy Format)', () => {
    it('handles tool_call and tool_result events', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'search_datasets',
          args: { query: 'sales data' },
        },
        {
          type: 'tool_result',
          name: 'search_datasets',
          result: 'Found 3 datasets',
        },
      ];

      render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show tool name
      expect(screen.getByText('search_datasets')).toBeInTheDocument();

      // Click to expand accordion
      const accordion = screen.getByText('search_datasets').closest('.MuiAccordion-root');
      expect(accordion).toBeInTheDocument();
    });

    it('shows tool arguments in expanded view', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'search_datasets',
          args: { query: 'sales data', limit: 10 },
        },
        {
          type: 'tool_result',
          name: 'search_datasets',
          result: 'Found datasets',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand the accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should show "Input:" label
      expect(screen.getByText('Input:')).toBeInTheDocument();

      // Should show JSON args (use findByText with regex to find in code block)
      const argsContent = container.querySelector('pre code')?.textContent;
      expect(argsContent).toContain('"query"');
      expect(argsContent).toContain('"sales data"');
      expect(argsContent).toContain('"limit"');
      expect(argsContent).toContain('10');
    });

    it('shows tool result in expanded view', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'execute_query',
          args: { sql: 'SELECT * FROM users' },
        },
        {
          type: 'tool_result',
          name: 'execute_query',
          result: 'Query returned 150 rows',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand the accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should show "Output:" label
      expect(screen.getByText('Output:')).toBeInTheDocument();

      // Should show result text
      expect(screen.getByText('Query returned 150 rows')).toBeInTheDocument();
    });
  });

  describe('Tool Start/End Events (New Format)', () => {
    it('handles tool_start and tool_end events', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'search_datasets',
          args: { query: 'revenue' },
          phase: 'navigator',
          stepId: 1,
        },
        {
          type: 'tool_end',
          name: 'search_datasets',
          result: 'Found 5 datasets',
        },
      ];

      render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show tool name
      expect(screen.getByText('search_datasets')).toBeInTheDocument();

      // Should show phase chip
      expect(screen.getByText('navigator')).toBeInTheDocument();
    });

    it('shows phase chip when phase is present', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'build_sql',
          args: { datasets: ['orders', 'customers'] },
          phase: 'sql_builder',
        },
        {
          type: 'tool_end',
          name: 'build_sql',
          result: 'SELECT * FROM orders',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show phase chip
      const chip = screen.getByText('sql_builder');
      expect(chip).toBeInTheDocument();
      expect(chip.closest('.MuiChip-root')).toBeInTheDocument();

      // Chip should be outlined variant and small size
      const chipElement = chip.closest('.MuiChip-root');
      expect(chipElement).toHaveClass('MuiChip-outlined');
      expect(chipElement).toHaveClass('MuiChip-sizeSmall');
    });

    it('does not show phase chip when phase is absent', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'verify_results',
          args: { data: 'test' },
          // No phase field
        },
        {
          type: 'tool_end',
          name: 'verify_results',
          result: 'Verified',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should not show any phase chip
      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips).toHaveLength(0);
    });
  });

  describe('Mixed Event Formats', () => {
    it('handles both old and new event formats in same stream', () => {
      const events: DataAgentStreamEvent[] = [
        // Old format
        {
          type: 'tool_call',
          name: 'search_datasets',
          args: { query: 'sales' },
        },
        {
          type: 'tool_result',
          name: 'search_datasets',
          result: 'Found datasets',
        },
        // New format
        {
          type: 'tool_start',
          name: 'build_sql',
          args: { datasets: ['sales'] },
          phase: 'sql_builder',
        },
        {
          type: 'tool_end',
          name: 'build_sql',
          result: 'SELECT * FROM sales',
        },
      ];

      render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show both tools
      expect(screen.getByText('search_datasets')).toBeInTheDocument();
      expect(screen.getByText('build_sql')).toBeInTheDocument();

      // Only the new format should have phase chip
      expect(screen.getByText('sql_builder')).toBeInTheDocument();
    });
  });

  describe('Streaming State', () => {
    it('shows collapsed chip with spinner for incomplete tool during streaming', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'execute_query',
          args: { sql: 'SELECT COUNT(*) FROM orders' },
          phase: 'executor',
        },
        // No tool_end yet
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={true} />);

      // Should show as chip, not accordion
      const chip = screen.getByText(/Running execute_query/);
      expect(chip).toBeInTheDocument();

      // Should have BuildIcon
      const buildIcon = container.querySelector('svg[data-testid="BuildIcon"]');
      expect(buildIcon).toBeInTheDocument();

      // Icon should have pulse animation
      const chipElement = chip.closest('.MuiChip-root');
      expect(chipElement).toBeInTheDocument();
    });

    it('converts to accordion when tool completes during streaming', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'execute_query',
          args: { sql: 'SELECT * FROM orders' },
          phase: 'executor',
        },
        {
          type: 'tool_end',
          name: 'execute_query',
          result: 'Query completed successfully',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={true} />);

      // Should show as accordion, not chip
      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).toBeInTheDocument();

      // Should not show "Running..." text
      expect(screen.queryByText(/Running execute_query/)).not.toBeInTheDocument();

      // Should show tool name normally
      expect(screen.getByText('execute_query')).toBeInTheDocument();
    });

    it('shows accordion for completed tool when not streaming', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'search_datasets',
          args: { query: 'customer' },
        },
        {
          type: 'tool_end',
          name: 'search_datasets',
          result: 'Found 2 datasets',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show as accordion
      const accordion = container.querySelector('.MuiAccordion-root');
      expect(accordion).toBeInTheDocument();

      // Should not show chip
      const chip = screen.queryByText(/Running search_datasets/);
      expect(chip).not.toBeInTheDocument();
    });
  });

  describe('Multiple Tool Calls', () => {
    it('shows multiple tool calls to the same tool', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'search_datasets',
          args: { query: 'sales' },
        },
        {
          type: 'tool_end',
          name: 'search_datasets',
          result: 'Found 3 datasets',
        },
        {
          type: 'tool_start',
          name: 'search_datasets',
          args: { query: 'customers' },
        },
        {
          type: 'tool_end',
          name: 'search_datasets',
          result: 'Found 2 datasets',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show 2 accordions with the same tool name
      const accordions = container.querySelectorAll('.MuiAccordion-root');
      expect(accordions).toHaveLength(2);

      // Both should have the same tool name
      const toolNames = screen.getAllByText('search_datasets');
      expect(toolNames).toHaveLength(2);
    });

    it('shows multiple different tools in order', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_start',
          name: 'search_datasets',
          args: { query: 'sales' },
          phase: 'navigator',
        },
        {
          type: 'tool_end',
          name: 'search_datasets',
          result: 'Found datasets',
        },
        {
          type: 'tool_start',
          name: 'build_sql',
          args: { datasets: ['sales'] },
          phase: 'sql_builder',
        },
        {
          type: 'tool_end',
          name: 'build_sql',
          result: 'SELECT * FROM sales',
        },
        {
          type: 'tool_start',
          name: 'execute_query',
          args: { sql: 'SELECT * FROM sales' },
          phase: 'executor',
        },
        {
          type: 'tool_end',
          name: 'execute_query',
          result: 'Query completed',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should show 3 accordions
      const accordions = container.querySelectorAll('.MuiAccordion-root');
      expect(accordions).toHaveLength(3);

      // Each should have different names
      expect(screen.getByText('search_datasets')).toBeInTheDocument();
      expect(screen.getByText('build_sql')).toBeInTheDocument();
      expect(screen.getByText('execute_query')).toBeInTheDocument();

      // Each should have their phase
      expect(screen.getByText('navigator')).toBeInTheDocument();
      expect(screen.getByText('sql_builder')).toBeInTheDocument();
      expect(screen.getByText('executor')).toBeInTheDocument();
    });
  });

  describe('Result Expansion', () => {
    it('shows "Show more" button for long results', () => {
      const longResult = 'A'.repeat(500); // More than 300 chars
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'get_schema',
          args: { table: 'orders' },
        },
        {
          type: 'tool_result',
          name: 'get_schema',
          result: longResult,
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should show "Show more" button
      expect(screen.getByText('Show more')).toBeInTheDocument();
    });

    it('does not show "Show more" button for short results', () => {
      const shortResult = 'A'.repeat(200); // Less than 300 chars
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'get_schema',
          args: { table: 'orders' },
        },
        {
          type: 'tool_result',
          name: 'get_schema',
          result: shortResult,
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should not show "Show more" button
      expect(screen.queryByText('Show more')).not.toBeInTheDocument();
      expect(screen.queryByText('Show less')).not.toBeInTheDocument();
    });

    it('toggles expansion when clicking "Show more/less"', () => {
      const longResult = 'A'.repeat(500);
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'get_data',
          args: {},
        },
        {
          type: 'tool_result',
          name: 'get_data',
          result: longResult,
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Click "Show more"
      const showMoreButton = screen.getByText('Show more');
      fireEvent.click(showMoreButton);

      // Button should change to "Show less"
      expect(screen.getByText('Show less')).toBeInTheDocument();
      expect(screen.queryByText('Show more')).not.toBeInTheDocument();

      // Click "Show less"
      const showLessButton = screen.getByText('Show less');
      fireEvent.click(showLessButton);

      // Button should change back to "Show more"
      expect(screen.getByText('Show more')).toBeInTheDocument();
      expect(screen.queryByText('Show less')).not.toBeInTheDocument();
    });
  });

  describe('Visual Structure', () => {
    it('renders accordion with correct MUI components', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'test_tool',
          args: { test: 'value' },
        },
        {
          type: 'tool_result',
          name: 'test_tool',
          result: 'result',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Should have accordion
      expect(container.querySelector('.MuiAccordion-root')).toBeInTheDocument();

      // Should have accordion summary
      expect(container.querySelector('.MuiAccordionSummary-root')).toBeInTheDocument();

      // Should have expand icon
      const expandIcon = container.querySelector('svg[data-testid="ExpandMoreIcon"]');
      expect(expandIcon).toBeInTheDocument();

      // Should have BuildIcon
      const buildIcon = container.querySelector('svg[data-testid="BuildIcon"]');
      expect(buildIcon).toBeInTheDocument();
    });

    it('renders JSON arguments with syntax highlighting', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'complex_tool',
          args: {
            nested: { data: 'value' },
            array: [1, 2, 3],
            boolean: true,
          },
        },
        {
          type: 'tool_result',
          name: 'complex_tool',
          result: 'done',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should have syntax highlighter (checks for prism code block)
      const codeBlock = container.querySelector('pre');
      expect(codeBlock).toBeInTheDocument();

      // Should contain JSON structure
      const argsContent = codeBlock?.textContent;
      expect(argsContent).toContain('"nested"');
      expect(argsContent).toContain('"array"');
      expect(argsContent).toContain('"boolean"');
    });

    it('renders markdown in tool results', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'get_info',
          args: {},
        },
        {
          type: 'tool_result',
          name: 'get_info',
          result: '**Bold text** and *italic text*',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Markdown should be rendered
      const boldText = container.querySelector('strong');
      const italicText = container.querySelector('em');

      expect(boldText).toBeInTheDocument();
      expect(italicText).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles tool_call without args', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'get_current_time',
          // No args
        },
        {
          type: 'tool_result',
          name: 'get_current_time',
          result: '2024-01-01',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should not show Input section
      expect(screen.queryByText('Input:')).not.toBeInTheDocument();

      // Should still show Output
      expect(screen.getByText('Output:')).toBeInTheDocument();
    });

    it('handles tool_call without result', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'notify',
          args: { message: 'test' },
        },
        // No tool_result
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Should show Input
      expect(screen.getByText('Input:')).toBeInTheDocument();

      // Should not show Output section
      expect(screen.queryByText('Output:')).not.toBeInTheDocument();
    });

    it('handles empty result string', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'tool_call',
          name: 'test_tool',
          args: {},
        },
        {
          type: 'tool_result',
          name: 'test_tool',
          result: '',
        },
      ];

      const { container } = render(<ToolCallAccordion events={events} isStreaming={false} />);

      // Expand accordion
      const expandButton = container.querySelector('.MuiAccordionSummary-root');
      fireEvent.click(expandButton!);

      // Empty strings are falsy, so Output section should not be shown
      expect(screen.queryByText('Output:')).not.toBeInTheDocument();
    });
  });
});
