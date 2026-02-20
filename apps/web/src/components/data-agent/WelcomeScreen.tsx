import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  useTheme,
  Chip,
  Skeleton,
  Button,
  alpha,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  AccountTree as AccountTreeIcon,
  Storage as StorageIcon,
  Share as ShareIcon,
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { getOntologies } from '../../services/api';
import { Ontology } from '../../types';

interface WelcomeScreenProps {
  onOntologySelect: (ontologyId: string, ontologyName: string) => void;
}

export function WelcomeScreen({ onOntologySelect }: WelcomeScreenProps) {
  const theme = useTheme();
  const [ontologies, setOntologies] = useState<Ontology[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOntologies = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getOntologies({ status: 'ready', pageSize: 100 });
        setOntologies(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ontologies');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOntologies();
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        p: 4,
        bgcolor: theme.palette.mode === 'dark' ? 'background.default' : 'grey.50',
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
          maxWidth: 900,
          mx: 'auto',
          width: '100%',
        }}
      >
        <SmartToyIcon
          sx={{
            fontSize: 80,
            color: 'primary.main',
            mb: 2,
          }}
        />
        <Typography variant="h4" gutterBottom fontWeight="medium">
          Data Agent
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Select an ontology to start exploring your data
        </Typography>

        {isLoading ? (
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {[1, 2, 3, 4].map((i) => (
              <Grid item xs={12} sm={6} key={i}>
                <Skeleton
                  variant="rectangular"
                  height={140}
                  sx={{
                    borderRadius: 1,
                    bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.05) : 'grey.200',
                  }}
                />
              </Grid>
            ))}
          </Grid>
        ) : error ? (
          <Box
            sx={{
              mt: 4,
              p: 3,
              borderRadius: 2,
              border: 1,
              borderColor: 'error.main',
              bgcolor: alpha(theme.palette.error.main, 0.1),
            }}
          >
            <Typography color="error">{error}</Typography>
          </Box>
        ) : ontologies.length === 0 ? (
          <Box
            sx={{
              mt: 4,
              p: 6,
              borderRadius: 2,
              border: 1,
              borderColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.12) : 'grey.300',
              bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.02) : 'background.paper',
            }}
          >
            <AccountTreeIcon
              sx={{
                fontSize: 64,
                color: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.3) : 'grey.400',
                mb: 2,
              }}
            />
            <Typography variant="h6" gutterBottom color="text.primary">
              No ontologies available
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create an ontology from a semantic model to start chatting with your data
            </Typography>
            <Button
              variant="contained"
              component={Link}
              to="/ontologies"
              sx={{
                textTransform: 'none',
                px: 3,
                py: 1,
              }}
            >
              Go to Ontologies
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {ontologies.map((ontology) => (
              <Grid item xs={12} sm={6} md={4} key={ontology.id}>
                <Card
                  sx={{
                    height: '100%',
                    border: 1,
                    borderColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.12) : 'grey.300',
                    bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.02) : 'background.paper',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.palette.mode === 'dark'
                        ? `0 8px 24px ${alpha(theme.palette.primary.main, 0.2)}`
                        : 4,
                      borderColor: 'primary.main',
                      bgcolor: theme.palette.mode === 'dark'
                        ? alpha(theme.palette.primary.main, 0.08)
                        : alpha(theme.palette.primary.main, 0.04),
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => onOntologySelect(ontology.id, ontology.name)}
                    sx={{ height: '100%' }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Typography
                        variant="h6"
                        fontWeight="medium"
                        gutterBottom
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ontology.name}
                      </Typography>

                      {ontology.semanticModel?.name && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            mb: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ontology.semanticModel.name}
                        </Typography>
                      )}

                      <Box
                        sx={{
                          display: 'flex',
                          gap: 1,
                          mt: 2,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Chip
                          icon={<StorageIcon />}
                          label={`${ontology.nodeCount} nodes`}
                          size="small"
                          sx={{
                            bgcolor: alpha(theme.palette.info.main, 0.1),
                            color: theme.palette.info.main,
                            borderColor: alpha(theme.palette.info.main, 0.3),
                            '& .MuiChip-icon': {
                              color: theme.palette.info.main,
                            },
                          }}
                          variant="outlined"
                        />
                        <Chip
                          icon={<ShareIcon />}
                          label={`${ontology.relationshipCount} links`}
                          size="small"
                          sx={{
                            bgcolor: alpha(theme.palette.success.main, 0.1),
                            color: theme.palette.success.main,
                            borderColor: alpha(theme.palette.success.main, 0.3),
                            '& .MuiChip-icon': {
                              color: theme.palette.success.main,
                            },
                          }}
                          variant="outlined"
                        />
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
}
