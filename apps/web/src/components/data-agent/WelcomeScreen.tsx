import { Box, Typography, Card, CardActionArea, CardContent, Grid, useTheme } from '@mui/material';
import { SmartToy as SmartToyIcon } from '@mui/icons-material';

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  {
    title: 'Top Customers',
    text: 'Show me the top customers by order count',
  },
  {
    title: 'Revenue Trend',
    text: "What's the monthly revenue trend?",
  },
  {
    title: 'Schema Overview',
    text: 'Describe the schema of the main tables',
  },
  {
    title: 'Regional Comparison',
    text: 'Compare sales across regions',
  },
];

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  const theme = useTheme();

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
          maxWidth: 800,
          mx: 'auto',
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
          Ask questions about your data in natural language
        </Typography>

        <Grid container spacing={2} sx={{ mt: 2 }}>
          {SUGGESTIONS.map((suggestion, index) => (
            <Grid item xs={12} sm={6} key={index}>
              <Card
                sx={{
                  height: '100%',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <CardActionArea
                  onClick={() => onSuggestionClick(suggestion.text)}
                  sx={{ height: '100%' }}
                >
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                      {suggestion.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {suggestion.text}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}
