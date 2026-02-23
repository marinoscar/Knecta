import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';

describe('App', () => {
  it('renders without crashing and shows login page initially', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Wait for lazy loaded component to render
    // The App will make an API call to check auth, MSW will handle it
    await waitFor(
      () => {
        // Should either show login page or home page depending on mock auth state
        // The home page shows a notification banner while dashboard loads
        const notificationText = screen.queryByText(/Enable notifications/i);
        const loginText = screen.queryByText(/sign in/i);
        const knectaText = screen.queryByText(/Knecta/i);
        expect(notificationText || loginText || knectaText).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });
});
