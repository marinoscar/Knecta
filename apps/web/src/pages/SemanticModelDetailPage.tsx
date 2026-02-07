import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';

export default function SemanticModelDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Semantic Model Detail
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Viewing model: {id}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          This page will be implemented in a future update.
        </Typography>
      </Box>
    </Container>
  );
}
