import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { PhaseIndicator } from '../../../components/data-agent/PhaseIndicator';
import type { DataAgentStreamEvent } from '../../../types';

describe('PhaseIndicator', () => {
  describe('Empty State', () => {
    it('renders nothing when no phase events', () => {
      const events: DataAgentStreamEvent[] = [];
      const { container } = render(<PhaseIndicator events={events} isStreaming={false} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when events contain no phase-related events', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'message_start' },
        { type: 'text', content: 'Some text' },
        { type: 'message_complete' },
      ];
      const { container } = render(<PhaseIndicator events={events} isStreaming={false} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Single Phase', () => {
    it('shows active phase with spinner when phase_start received but no phase_complete', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Analyzing query complexity' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={true} />);

      // Should show the phase label
      expect(screen.getByText('Plan')).toBeInTheDocument();

      // Should have active indicator (Loop icon with spin animation)
      const activeIcon = container.querySelector('svg[data-testid="LoopIcon"]');
      expect(activeIcon).toBeInTheDocument();

      // Should show description and progress bar when streaming
      expect(screen.getByText('Analyzing query complexity')).toBeInTheDocument();
      const progressBar = container.querySelector('.MuiLinearProgress-root');
      expect(progressBar).toBeInTheDocument();
    });

    it('shows completed phase with check icon when both phase_start and phase_complete received', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Analyzing query complexity' },
        { type: 'phase_complete', phase: 'planner' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={false} />);

      // Should show the phase label
      expect(screen.getByText('Plan')).toBeInTheDocument();

      // Should have completed indicator (CheckCircle icon)
      const checkIcon = container.querySelector('svg[data-testid="CheckCircleIcon"]');
      expect(checkIcon).toBeInTheDocument();

      // Should not show description when not streaming
      expect(screen.queryByText('Analyzing query complexity')).not.toBeInTheDocument();
    });

    it('hides description when streaming ends', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Analyzing query complexity' },
      ];

      const { rerender } = render(<PhaseIndicator events={events} isStreaming={true} />);

      // Description should be visible when streaming
      expect(screen.getByText('Analyzing query complexity')).toBeInTheDocument();

      // Update to not streaming
      rerender(<PhaseIndicator events={events} isStreaming={false} />);

      // Description should be hidden
      expect(screen.queryByText('Analyzing query complexity')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Phases', () => {
    it('shows multiple phases in order - planner complete, navigator active', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Analyzing query' },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator', description: 'Locating datasets' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={true} />);

      // Should show both phases
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Navigate')).toBeInTheDocument();

      // Planner should be completed (check icon)
      const steppers = container.querySelectorAll('.MuiStep-root');
      expect(steppers).toHaveLength(2);

      const planStep = steppers[0];
      const navStep = steppers[1];

      // Check that plan step has completed status
      expect(within(planStep as HTMLElement).getByTestId('CheckCircleIcon')).toBeInTheDocument();

      // Check that nav step has active status (Loop icon)
      expect(within(navStep as HTMLElement).getByTestId('LoopIcon')).toBeInTheDocument();

      // Should show active phase description
      expect(screen.getByText('Locating datasets')).toBeInTheDocument();
    });

    it('shows only started phases, not pending ones', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Analyzing query' },
        { type: 'phase_complete', phase: 'planner' },
      ];

      render(<PhaseIndicator events={events} isStreaming={false} />);

      // Should only show planner
      expect(screen.getByText('Plan')).toBeInTheDocument();

      // Should not show future phases (navigator, sql_builder, etc.)
      expect(screen.queryByText('Navigate')).not.toBeInTheDocument();
      expect(screen.queryByText('Build SQL')).not.toBeInTheDocument();
      expect(screen.queryByText('Execute')).not.toBeInTheDocument();
    });

    it('shows phase description for active phase only', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Analyzing query complexity' },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator', description: 'Searching for relevant datasets' },
        { type: 'phase_complete', phase: 'navigator' },
        { type: 'phase_start', phase: 'sql_builder', description: 'Constructing SQL query' },
      ];

      render(<PhaseIndicator events={events} isStreaming={true} />);

      // Should only show the active phase description
      expect(screen.getByText('Constructing SQL query')).toBeInTheDocument();
      expect(screen.queryByText('Analyzing query complexity')).not.toBeInTheDocument();
      expect(screen.queryByText('Searching for relevant datasets')).not.toBeInTheDocument();
    });
  });

  describe('All Phases Complete', () => {
    it('handles all 6 phases - all show as completed', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Planning' },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator', description: 'Navigating' },
        { type: 'phase_complete', phase: 'navigator' },
        { type: 'phase_start', phase: 'sql_builder', description: 'Building SQL' },
        { type: 'phase_complete', phase: 'sql_builder' },
        { type: 'phase_start', phase: 'executor', description: 'Executing query' },
        { type: 'phase_complete', phase: 'executor' },
        { type: 'phase_start', phase: 'verifier', description: 'Verifying results' },
        { type: 'phase_complete', phase: 'verifier' },
        { type: 'phase_start', phase: 'explainer', description: 'Generating explanation' },
        { type: 'phase_complete', phase: 'explainer' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={false} />);

      // Should show all 6 phases
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Navigate')).toBeInTheDocument();
      expect(screen.getByText('Build SQL')).toBeInTheDocument();
      expect(screen.getByText('Execute')).toBeInTheDocument();
      expect(screen.getByText('Verify')).toBeInTheDocument();
      expect(screen.getByText('Explain')).toBeInTheDocument();

      // All should have check icons
      const checkIcons = container.querySelectorAll('svg[data-testid="CheckCircleIcon"]');
      expect(checkIcons).toHaveLength(6);

      // No active icons
      const activeIcons = container.querySelectorAll('svg[data-testid="LoopIcon"]');
      expect(activeIcons).toHaveLength(0);

      // No description shown when not streaming
      expect(screen.queryByText('Planning')).not.toBeInTheDocument();
    });

    it('shows no active phase when all complete and not streaming', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Planning' },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator', description: 'Navigating' },
        { type: 'phase_complete', phase: 'navigator' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={false} />);

      // No progress bar should be shown
      const progressBar = container.querySelector('.MuiLinearProgress-root');
      expect(progressBar).not.toBeInTheDocument();

      // No description text should be shown
      expect(screen.queryByText('Planning')).not.toBeInTheDocument();
      expect(screen.queryByText('Navigating')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles phase_complete before phase_start (out of order events)', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_complete', phase: 'planner' }, // Complete before start
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={false} />);

      // Should still show the phase as complete
      expect(screen.getByText('Plan')).toBeInTheDocument();
      const checkIcon = container.querySelector('svg[data-testid="CheckCircleIcon"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('filters out unknown phase names (not in PHASE_ORDER)', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'unknown_phase', description: 'Custom phase' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={true} />);

      // Unknown phases are filtered out, so nothing should render
      expect(container.firstChild).toBeNull();
    });

    it('handles phase without description', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' }, // No description
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={true} />);

      // Should still show the phase
      expect(screen.getByText('Plan')).toBeInTheDocument();

      // Should show progress bar but no description text
      const progressBar = container.querySelector('.MuiLinearProgress-root');
      expect(progressBar).toBeInTheDocument();

      // Caption should not be rendered if no description
      const captions = container.querySelectorAll('.MuiTypography-caption');
      const descriptionCaption = Array.from(captions).find(
        (el) => el.textContent !== 'Plan' && el.textContent !== ''
      );
      expect(descriptionCaption).toBeUndefined();
    });

    it('handles duplicate phase_start events', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'First description' },
        { type: 'phase_start', phase: 'planner', description: 'Second description' },
      ];

      render(<PhaseIndicator events={events} isStreaming={true} />);

      // Should show the last description
      expect(screen.getByText('Second description')).toBeInTheDocument();
      expect(screen.queryByText('First description')).not.toBeInTheDocument();
    });
  });

  describe('Visual States', () => {
    it('renders stepper with correct structure', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner', description: 'Planning' },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator', description: 'Navigating' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={true} />);

      // Should have MUI Stepper
      const stepper = container.querySelector('.MuiStepper-root');
      expect(stepper).toBeInTheDocument();

      // Should have alternativeLabel prop applied
      expect(stepper).toHaveClass('MuiStepper-alternativeLabel');

      // Should have 2 steps
      const steps = container.querySelectorAll('.MuiStep-root');
      expect(steps).toHaveLength(2);

      // Should have step labels
      const stepLabels = container.querySelectorAll('.MuiStepLabel-root');
      expect(stepLabels).toHaveLength(2);
    });

    it('renders progress bar with correct styling', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'executor', description: 'Running query' },
      ];

      const { container } = render(<PhaseIndicator events={events} isStreaming={true} />);

      const progressBar = container.querySelector('.MuiLinearProgress-root');
      expect(progressBar).toBeInTheDocument();

      // Check that it's indeterminate (no value prop)
      expect(progressBar).toHaveClass('MuiLinearProgress-indeterminate');
    });
  });
});
