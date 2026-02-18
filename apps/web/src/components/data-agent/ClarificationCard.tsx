import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Divider,
} from '@mui/material';
import {
  HelpOutline as QuestionIcon,
  CheckCircle as ProceedIcon,
  Send as SendIcon,
} from '@mui/icons-material';

interface ClarificationQuestion {
  question: string;
  assumption: string;
}

interface ClarificationCardProps {
  questions: ClarificationQuestion[];
  onAnswer: (response: string) => void;
  onProceedWithAssumptions: () => void;
  disabled?: boolean;
}

export function ClarificationCard({
  questions,
  onAnswer,
  onProceedWithAssumptions,
  disabled = false,
}: ClarificationCardProps) {
  const [answerText, setAnswerText] = useState('');

  const handleAnswer = () => {
    if (answerText.trim()) {
      onAnswer(answerText.trim());
      setAnswerText('');
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mt: 1.5,
        border: 1,
        borderColor: 'info.light',
        borderRadius: 2,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(41, 121, 255, 0.08)'
            : 'rgba(41, 121, 255, 0.04)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <QuestionIcon color="info" fontSize="small" />
        <Typography variant="subtitle2" color="info.main">
          Clarification Needed
        </Typography>
      </Box>

      {questions.map((q, i) => (
        <Box key={i} sx={{ mb: 1.5 }}>
          <Typography variant="body2" fontWeight={600}>
            {i + 1}. {q.question}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ ml: 2.5, display: 'block' }}
          >
            Default assumption: {q.assumption}
          </Typography>
        </Box>
      ))}

      <Divider sx={{ my: 1.5 }} />

      <TextField
        fullWidth
        multiline
        maxRows={3}
        size="small"
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        placeholder="Type your clarification..."
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAnswer();
          }
        }}
        sx={{ mb: 1.5 }}
      />

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          startIcon={<ProceedIcon />}
          onClick={onProceedWithAssumptions}
          disabled={disabled}
        >
          Proceed with assumptions
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<SendIcon />}
          onClick={handleAnswer}
          disabled={!answerText.trim() || disabled}
        >
          Answer
        </Button>
      </Box>
    </Paper>
  );
}
