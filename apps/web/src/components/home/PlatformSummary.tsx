import { Paper, Box, Typography, Grid, Skeleton } from '@mui/material';
import {
  Storage as StorageIcon,
  Share as ShareIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';

interface PlatformSummaryProps {
  totalDatasets: number;
  totalRelationships: number;
  providerCount: number;
  isLoading?: boolean;
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: number;
}

function StatItem({ icon, label, value }: StatItemProps) {
  return (
    <Box
      sx={{
        bgcolor: 'action.hover',
        borderRadius: 1,
        px: 1.5,
        py: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Box sx={{ fontSize: 16, color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography variant="h5" fontWeight="bold">
        {value}
      </Typography>
    </Box>
  );
}

function StatSkeleton() {
  return (
    <Box
      sx={{
        bgcolor: 'action.hover',
        borderRadius: 1,
        px: 1.5,
        py: 1,
      }}
    >
      <Skeleton variant="text" width="60%" height={20} />
      <Skeleton variant="text" width="40%" height={36} />
    </Box>
  );
}

export function PlatformSummary({
  totalDatasets,
  totalRelationships,
  providerCount,
  isLoading = false,
}: PlatformSummaryProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        p: 2,
      }}
    >
      <Typography variant="h6" fontWeight="medium" sx={{ mb: 2 }}>
        Platform Summary
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={6}>
          {isLoading ? (
            <StatSkeleton />
          ) : (
            <StatItem
              icon={<StorageIcon fontSize="inherit" />}
              label="Datasets"
              value={totalDatasets}
            />
          )}
        </Grid>

        <Grid item xs={6}>
          {isLoading ? (
            <StatSkeleton />
          ) : (
            <StatItem
              icon={<ShareIcon fontSize="inherit" />}
              label="Relationships"
              value={totalRelationships}
            />
          )}
        </Grid>

        <Grid item xs={12}>
          {isLoading ? (
            <StatSkeleton />
          ) : (
            <StatItem
              icon={<PsychologyIcon fontSize="inherit" />}
              label="LLM Providers"
              value={providerCount}
            />
          )}
        </Grid>
      </Grid>
    </Paper>
  );
}
