import { useState, KeyboardEvent } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Button,
  useTheme,
  alpha,
  Skeleton,
} from '@mui/material';
import { ArrowForward as ArrowForwardIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { Ontology } from '../../types';

type DashboardMode = 'new' | 'setup' | 'active';

interface HeroBannerProps {
  mode: DashboardMode;
  readyOntologies: Ontology[];
  totalDatasets: number;
  isLoading?: boolean;
  onAskQuestion: (ontologyId: string, question: string) => void;
  nextSetupStep?: {
    label: string;
    path: string;
  };
}

const PIPELINE_STEPS = ['Connect', 'Understand', 'Model', 'Ask'];

function LoadingSkeleton() {
  const theme = useTheme();
  const skeletonBg =
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.common.white, 0.07)
      : alpha(theme.palette.primary.main, 0.08);

  return (
    <>
      <Skeleton
        variant="text"
        width="55%"
        height={48}
        sx={{ mx: 'auto', bgcolor: skeletonBg }}
      />
      <Skeleton
        variant="text"
        width="40%"
        height={28}
        sx={{ mx: 'auto', mt: 1, bgcolor: skeletonBg }}
      />
      <Skeleton
        variant="rounded"
        width="100%"
        height={56}
        sx={{ mt: 3, bgcolor: skeletonBg }}
      />
    </>
  );
}

function ActiveMode({
  readyOntologies,
  totalDatasets,
  onAskQuestion,
}: Pick<HeroBannerProps, 'readyOntologies' | 'totalDatasets' | 'onAskQuestion'>) {
  const [question, setQuestion] = useState('');
  const [selectedOntologyId, setSelectedOntologyId] = useState<string>(
    readyOntologies[0]?.id ?? ''
  );

  const handleSubmit = () => {
    const trimmed = question.trim();
    if (!trimmed || !selectedOntologyId) return;
    onAskQuestion(selectedOntologyId, trimmed);
    setQuestion('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Ask anything about your data
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Powered by {readyOntologies.length}{' '}
        {readyOntologies.length === 1 ? 'ontology' : 'ontologies'} across{' '}
        {totalDatasets} {totalDatasets === 1 ? 'dataset' : 'datasets'}
      </Typography>

      <TextField
        variant="outlined"
        fullWidth
        size="medium"
        placeholder="What would you like to know about your data?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        sx={{
          mt: 3,
          bgcolor: 'background.paper',
          borderRadius: 2,
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
          },
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                color="primary"
                onClick={handleSubmit}
                disabled={!question.trim()}
                aria-label="Submit question"
              >
                <ArrowForwardIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mt: 2,
          flexWrap: { xs: 'nowrap', sm: 'wrap' },
          overflowX: { xs: 'auto', sm: 'visible' },
          pb: { xs: 0.5, sm: 0 },
          justifyContent: { xs: 'flex-start', sm: 'center' },
        }}
      >
        {readyOntologies.slice(0, 10).map((ontology) => {
          const isSelected = ontology.id === selectedOntologyId;
          return (
            <Chip
              key={ontology.id}
              label={ontology.name}
              color={isSelected ? 'primary' : 'default'}
              variant={isSelected ? 'filled' : 'outlined'}
              onClick={() => setSelectedOntologyId(ontology.id)}
              sx={{ flexShrink: 0 }}
            />
          );
        })}
      </Box>
    </>
  );
}

function NewMode() {
  const navigate = useNavigate();

  return (
    <>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Welcome to Knecta
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Connect your databases and start asking questions in natural language
      </Typography>

      <Button
        variant="contained"
        size="large"
        onClick={() => navigate('/connections')}
        sx={{ mt: 2, px: 4, py: 1.5 }}
      >
        Connect your first database
      </Button>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          mt: 3,
          flexWrap: 'wrap',
        }}
      >
        {PIPELINE_STEPS.map((step, index) => (
          <Box
            key={step}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Typography
              variant="caption"
              color={index === 0 ? 'primary.main' : 'text.secondary'}
              fontWeight={index === 0 ? 'bold' : 'regular'}
            >
              {step}
            </Typography>
            {index < PIPELINE_STEPS.length - 1 && (
              <Typography variant="caption" color="text.secondary">
                →
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </>
  );
}

function SetupMode({
  nextSetupStep,
}: Pick<HeroBannerProps, 'nextSetupStep'>) {
  const navigate = useNavigate();

  return (
    <>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        You're almost there
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {nextSetupStep?.label ?? 'Complete setup to start asking questions'}
      </Typography>

      <Button
        variant="contained"
        size="large"
        onClick={() => nextSetupStep && navigate(nextSetupStep.path)}
        disabled={!nextSetupStep}
        sx={{ mt: 2, px: 4, py: 1.5 }}
      >
        Continue Setup
      </Button>
    </>
  );
}

export function HeroBanner({
  mode,
  readyOntologies,
  totalDatasets,
  isLoading = false,
  onAskQuestion,
  nextSetupStep,
}: HeroBannerProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        py: 5,
        px: 3,
        borderRadius: 2,
        mb: 3,
        bgcolor:
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.primary.main, 0.08)
            : alpha(theme.palette.primary.main, 0.04),
        textAlign: 'center',
      }}
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : mode === 'active' ? (
        <ActiveMode
          readyOntologies={readyOntologies}
          totalDatasets={totalDatasets}
          onAskQuestion={onAskQuestion}
        />
      ) : mode === 'new' ? (
        <NewMode />
      ) : (
        <SetupMode nextSetupStep={nextSetupStep} />
      )}
    </Box>
  );
}
