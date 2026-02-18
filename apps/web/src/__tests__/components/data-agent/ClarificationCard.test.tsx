import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ClarificationCard } from '../../../components/data-agent/ClarificationCard';

describe('ClarificationCard', () => {
  const mockOnAnswer = vi.fn();
  const mockOnProceedWithAssumptions = vi.fn();

  const mockQuestions = [
    {
      question: 'Which time period should I analyze?',
      assumption: 'Last 30 days',
    },
    {
      question: 'Should I include inactive users?',
      assumption: 'No, active users only',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the "Clarification Needed" header', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByText('Clarification Needed')).toBeInTheDocument();
    });

    it('renders all questions with their text', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByText(/Which time period should I analyze\?/)).toBeInTheDocument();
      expect(screen.getByText(/Should I include inactive users\?/)).toBeInTheDocument();
    });

    it('renders all question assumptions', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByText(/Default assumption: Last 30 days/)).toBeInTheDocument();
      expect(screen.getByText(/Default assumption: No, active users only/)).toBeInTheDocument();
    });

    it('renders numbered questions in order', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByText(/1\. Which time period/)).toBeInTheDocument();
      expect(screen.getByText(/2\. Should I include inactive users/)).toBeInTheDocument();
    });

    it('renders the text input field', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByPlaceholderText('Type your clarification...')).toBeInTheDocument();
    });

    it('renders the Answer button', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByRole('button', { name: /answer/i })).toBeInTheDocument();
    });

    it('renders the "Proceed with assumptions" button', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByRole('button', { name: /proceed with assumptions/i })).toBeInTheDocument();
    });
  });

  describe('Button State', () => {
    it('Answer button is disabled when input is empty', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByRole('button', { name: /answer/i })).toBeDisabled();
    });

    it('Answer button is disabled when input contains only whitespace', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, '   ');

      expect(screen.getByRole('button', { name: /answer/i })).toBeDisabled();
    });

    it('Answer button is enabled when input has text', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, 'My answer');

      expect(screen.getByRole('button', { name: /answer/i })).not.toBeDisabled();
    });
  });

  describe('Answer Submission', () => {
    it('calls onAnswer with the input text when Answer button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, 'Last 7 days');
      await user.click(screen.getByRole('button', { name: /answer/i }));

      expect(mockOnAnswer).toHaveBeenCalledWith('Last 7 days');
      expect(mockOnAnswer).toHaveBeenCalledTimes(1);
    });

    it('trims whitespace from input before calling onAnswer', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, '  Last 7 days  ');
      await user.click(screen.getByRole('button', { name: /answer/i }));

      expect(mockOnAnswer).toHaveBeenCalledWith('Last 7 days');
    });

    it('clears input after successful answer submission via button click', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, 'Last 7 days');
      await user.click(screen.getByRole('button', { name: /answer/i }));

      expect(input).toHaveValue('');
    });

    it('calls onAnswer when Enter key is pressed without Shift', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, 'My answer{Enter}');

      expect(mockOnAnswer).toHaveBeenCalledWith('My answer');
    });

    it('clears input after answer submission via Enter key', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, 'My answer{Enter}');

      expect(input).toHaveValue('');
    });

    it('does NOT call onAnswer when Shift+Enter is pressed (allows multiline)', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.type(input, 'Line one');
      await user.keyboard('{Shift>}{Enter}{/Shift}');

      expect(mockOnAnswer).not.toHaveBeenCalled();
    });

    it('does not call onAnswer when Enter pressed with empty input', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      const input = screen.getByPlaceholderText('Type your clarification...');
      await user.click(input);
      await user.keyboard('{Enter}');

      expect(mockOnAnswer).not.toHaveBeenCalled();
    });
  });

  describe('Proceed with Assumptions', () => {
    it('calls onProceedWithAssumptions when "Proceed with assumptions" button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      await user.click(screen.getByRole('button', { name: /proceed with assumptions/i }));

      expect(mockOnProceedWithAssumptions).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disabled State', () => {
    it('disables the text input when disabled prop is true', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
          disabled={true}
        />,
      );

      expect(screen.getByPlaceholderText('Type your clarification...')).toBeDisabled();
    });

    it('disables the Answer button when disabled prop is true', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
          disabled={true}
        />,
      );

      expect(screen.getByRole('button', { name: /answer/i })).toBeDisabled();
    });

    it('disables the "Proceed with assumptions" button when disabled prop is true', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
          disabled={true}
        />,
      );

      expect(screen.getByRole('button', { name: /proceed with assumptions/i })).toBeDisabled();
    });

    it('does not call onAnswer when disabled (button is disabled so click is blocked)', () => {
      render(
        <ClarificationCard
          questions={mockQuestions}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
          disabled={true}
        />,
      );

      // The button is disabled - click events cannot reach it (pointer-events: none)
      const answerButton = screen.getByRole('button', { name: /answer/i });
      expect(answerButton).toBeDisabled();
      expect(mockOnAnswer).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('renders correctly with a single question', () => {
      const singleQuestion = [{ question: 'Which region?', assumption: 'All regions' }];

      render(
        <ClarificationCard
          questions={singleQuestion}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByText(/1\. Which region\?/)).toBeInTheDocument();
      expect(screen.getByText(/Default assumption: All regions/)).toBeInTheDocument();
    });

    it('renders correctly with no questions', () => {
      render(
        <ClarificationCard
          questions={[]}
          onAnswer={mockOnAnswer}
          onProceedWithAssumptions={mockOnProceedWithAssumptions}
        />,
      );

      expect(screen.getByText('Clarification Needed')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type your clarification...')).toBeInTheDocument();
    });
  });
});
