import { useMemo } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  RadioButtonUnchecked as PendingIcon,
  Loop as ActiveIcon,
} from '@mui/icons-material';
import type { DataAgentStreamEvent } from '../../types';

interface PhaseIndicatorProps {
  events: DataAgentStreamEvent[];
  isStreaming: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  planner: 'Plan',
  navigator: 'Navigate',
  sql_builder: 'Build SQL',
  executor: 'Execute',
  verifier: 'Verify',
  explainer: 'Explain',
};

const PHASE_ORDER = ['planner', 'navigator', 'sql_builder', 'executor', 'verifier', 'explainer'];

interface PhaseStatus {
  phase: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
  description?: string;
}

function extractPhaseStatuses(events: DataAgentStreamEvent[]): PhaseStatus[] {
  const startedPhases = new Set<string>();
  const completedPhases = new Set<string>();
  const descriptions = new Map<string, string>();

  for (const event of events) {
    if (event.type === 'phase_start' && event.phase) {
      startedPhases.add(event.phase);
      if (event.description) {
        descriptions.set(event.phase, event.description);
      }
    } else if (event.type === 'phase_complete' && event.phase) {
      completedPhases.add(event.phase);
    }
  }

  // Only show phases that have been started or are expected
  const activePhases = PHASE_ORDER.filter(
    (p) => startedPhases.has(p) || completedPhases.has(p),
  );

  // If no phases started yet, don't show anything
  if (activePhases.length === 0) return [];

  return activePhases.map((phase) => ({
    phase,
    label: PHASE_LABELS[phase] || phase,
    status: completedPhases.has(phase)
      ? 'complete'
      : startedPhases.has(phase)
        ? 'active'
        : 'pending',
    description: descriptions.get(phase),
  }));
}

export function PhaseIndicator({ events, isStreaming }: PhaseIndicatorProps) {
  const phases = useMemo(() => extractPhaseStatuses(events), [events]);

  if (phases.length === 0) return null;

  const activePhase = phases.find((p) => p.status === 'active');
  const activeStepIndex = phases.findIndex((p) => p.status === 'active');

  return (
    <Box sx={{ mb: 2, px: 1 }}>
      <Stepper
        activeStep={activeStepIndex >= 0 ? activeStepIndex : phases.length}
        alternativeLabel
        sx={{
          '& .MuiStepConnector-line': {
            minWidth: 20,
          },
        }}
      >
        {phases.map((phase) => (
          <Step key={phase.phase} completed={phase.status === 'complete'}>
            <StepLabel
              StepIconComponent={() => {
                if (phase.status === 'complete') {
                  return <CheckIcon color="success" fontSize="small" />;
                }
                if (phase.status === 'active') {
                  return (
                    <ActiveIcon
                      color="primary"
                      fontSize="small"
                      sx={{
                        animation: 'spin 2s linear infinite',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }}
                    />
                  );
                }
                return <PendingIcon color="disabled" fontSize="small" />;
              }}
            >
              <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                {phase.label}
              </Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Active phase description */}
      {activePhase && isStreaming && (
        <Box sx={{ mt: 1, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {activePhase.description}
          </Typography>
          <LinearProgress
            sx={{ mt: 0.5, mx: 'auto', maxWidth: 300, borderRadius: 1 }}
          />
        </Box>
      )}
    </Box>
  );
}
