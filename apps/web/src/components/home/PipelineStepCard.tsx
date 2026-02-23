import { ReactNode } from 'react';
import { Paper, Box, Typography, CardActionArea, Skeleton, alpha } from '@mui/material';

interface PipelineStepCardProps {
  icon: ReactNode;
  count: number;
  label: string;
  accentColor: string;
  onClick: () => void;
  isLoading?: boolean;
}

export function PipelineStepCard({
  icon,
  count,
  label,
  accentColor,
  onClick,
  isLoading = false,
}: PipelineStepCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 1,
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
          borderColor: accentColor,
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box
            sx={{
              bgcolor: alpha(accentColor, 0.1),
              borderRadius: '50%',
              p: 1,
              display: 'flex',
              color: accentColor,
              fontSize: 24,
              '& svg': { fontSize: 24 },
            }}
          >
            {icon}
          </Box>
          <Box>
            {isLoading ? (
              <>
                <Skeleton variant="text" width={48} height={40} />
                <Skeleton variant="text" width={80} height={20} />
              </>
            ) : (
              <>
                <Typography variant="h4" fontWeight="bold" lineHeight={1.2}>
                  {count}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
              </>
            )}
          </Box>
        </Box>
      </CardActionArea>
    </Paper>
  );
}
