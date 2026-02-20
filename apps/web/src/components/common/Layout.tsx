import { Box, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { AppBar } from '../navigation/AppBar';
import { Sidebar } from '../navigation/Sidebar';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const theme = useTheme();

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: theme.palette.background.default,
      }}
    >
      <AppBar onMenuClick={handleSidebarToggle} />
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar open={sidebarOpen} onClose={handleSidebarClose} />
        <Box
          component="main"
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
