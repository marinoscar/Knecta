import {
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

interface SetupStepperProps {
  connectionsTotal: number;
  readyModelsCount: number;
  readyOntologiesCount: number;
  chatsTotal: number;
}

export function SetupStepper({
  connectionsTotal,
  readyModelsCount,
  readyOntologiesCount,
  chatsTotal,
}: SetupStepperProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();

  const steps = [
    {
      label: 'Connect a database',
      completed: connectionsTotal > 0,
      path: '/connections',
    },
    {
      label: 'Generate a semantic model',
      completed: readyModelsCount > 0,
      path: '/semantic-models/new',
    },
    {
      label: 'Create an ontology',
      completed: readyOntologiesCount > 0,
      path: '/ontologies',
    },
    {
      label: 'Ask a question',
      completed: chatsTotal > 0,
      path: '/agent',
    },
  ];

  const allComplete = steps.every((s) => s.completed);
  if (allComplete) return null;

  const activeStep = steps.findIndex((s) => !s.completed);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        mb: 3,
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Stepper
        activeStep={activeStep}
        alternativeLabel={isDesktop}
        orientation={isDesktop ? 'horizontal' : 'vertical'}
      >
        {steps.map((step, index) => (
          <Step key={step.label} completed={step.completed} active={index === activeStep}>
            <StepLabel>
              {step.label}
              {index === activeStep && (
                <Button
                  variant="text"
                  size="small"
                  color="primary"
                  onClick={() => navigate(step.path)}
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  {step.label}
                </Button>
              )}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Paper>
  );
}
