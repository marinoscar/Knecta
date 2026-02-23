import {
  Card,
  CardContent,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Skeleton,
  Box,
} from '@mui/material';
import {
  AccountTree as AccountTreeIcon,
  Hub as HubIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { SemanticModel, Ontology } from '../../types';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface RecentActivityProps {
  models: SemanticModel[];
  ontologies: Ontology[];
  isLoading?: boolean;
}

type ActivityItem =
  | { type: 'model'; item: SemanticModel; updatedAt: string }
  | { type: 'ontology'; item: Ontology; updatedAt: string };

type ChipColor = 'success' | 'warning' | 'error' | 'default';

function getStatusColor(status: string): ChipColor {
  switch (status) {
    case 'ready':
    case 'completed':
      return 'success';
    case 'generating':
    case 'creating':
      return 'warning';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

export function RecentActivity({ models, ontologies, isLoading = false }: RecentActivityProps) {
  const navigate = useNavigate();

  const items: ActivityItem[] = [
    ...models.map((m): ActivityItem => ({ type: 'model', item: m, updatedAt: m.updatedAt })),
    ...ontologies.map((o): ActivityItem => ({ type: 'ontology', item: o, updatedAt: o.updatedAt })),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const handleItemClick = (activity: ActivityItem) => {
    if (activity.type === 'model') {
      navigate(`/semantic-models/${activity.item.id}`);
    } else {
      navigate(`/ontologies/${activity.item.id}`);
    }
  };

  return (
    <Card
      elevation={0}
      sx={{ border: 1, borderColor: 'divider' }}
    >
      <CardContent>
        <Typography variant="h6" fontWeight="medium" sx={{ mb: 1 }}>
          Recent Activity
        </Typography>

        {isLoading ? (
          <Box>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={48}
                sx={{ borderRadius: 1, mb: 1 }}
              />
            ))}
          </Box>
        ) : items.length === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ py: 3, textAlign: 'center' }}
          >
            No models or ontologies yet.
          </Typography>
        ) : (
          <List disablePadding>
            {items.map((activity) => (
              <ListItemButton
                key={`${activity.type}-${activity.item.id}`}
                onClick={() => handleItemClick(activity)}
                sx={{ gap: 1, px: 0 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {activity.type === 'model' ? (
                    <AccountTreeIcon sx={{ color: 'info.main' }} />
                  ) : (
                    <HubIcon sx={{ color: 'success.main' }} />
                  )}
                </ListItemIcon>
                <ListItemText primary={activity.item.name} primaryTypographyProps={{ noWrap: true }} />
                <Chip
                  size="small"
                  label={activity.item.status}
                  color={getStatusColor(activity.item.status)}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0 }}
                >
                  {formatRelativeTime(activity.updatedAt)}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
