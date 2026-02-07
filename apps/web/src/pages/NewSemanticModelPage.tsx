import { Container, Typography, Box } from '@mui/material';

export default function NewSemanticModelPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          New Semantic Model
        </Typography>
        <Typography variant="body1" color="text.secondary">
          This page will be implemented in a future update.
        </Typography>
      </Box>
    </Container>
  );
}
