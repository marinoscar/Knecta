import { useCallback } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  useTheme,
} from '@mui/material';
import {
  Home as HomeIcon,
  Settings as SettingsIcon,
  AdminPanelSettings as AdminIcon,
  People as PeopleIcon,
  Storage as StorageIcon,
  AccountTree as AccountTreeIcon,
  Hub as HubIcon,
  SmartToy as SmartToyIcon,
  TableView as TableViewIcon,
  FileUpload as FileUploadIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const DRAWER_WIDTH = 240;

export function Sidebar({ open, onClose }: SidebarProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, hasPermission } = usePermissions();

  const menuItems = [
    {
      label: 'Home',
      icon: <HomeIcon />,
      path: '/',
      visible: true,
    },
    {
      label: 'Connections',
      icon: <StorageIcon />,
      path: '/connections',
      visible: true,
    },
    {
      label: 'Semantic Models',
      icon: <AccountTreeIcon />,
      path: '/semantic-models',
      visible: hasPermission('semantic_models:read'),
    },
    {
      label: 'Ontologies',
      icon: <HubIcon />,
      path: '/ontologies',
      visible: hasPermission('ontologies:read'),
    },
    {
      label: 'Data Agent',
      icon: <SmartToyIcon />,
      path: '/agent',
      visible: hasPermission('data_agent:read'),
    },
    {
      label: 'Spreadsheets',
      icon: <TableViewIcon />,
      path: '/spreadsheets',
      visible: hasPermission('spreadsheet_agent:read'),
    },
    {
      label: 'Data Import',
      icon: <FileUploadIcon />,
      path: '/data-imports',
      visible: hasPermission('data_imports:read'),
    },
    {
      label: 'User Settings',
      icon: <SettingsIcon />,
      path: '/settings',
      visible: true,
    },
    {
      label: 'User Management',
      icon: <PeopleIcon />,
      path: '/admin/users',
      visible: isAdmin,
    },
    {
      label: 'System Settings',
      icon: <AdminIcon />,
      path: '/admin/settings',
      visible: isAdmin,
    },
  ];

  const handleNavigate = useCallback(
    (path: string) => {
      // Close the drawer first, then navigate after a brief delay
      // This ensures the drawer closes properly before route change
      onClose();
      // Use setTimeout to allow the drawer close state to propagate
      // before triggering navigation which causes a re-render
      setTimeout(() => {
        navigate(path);
      }, 0);
    },
    [onClose, navigate],
  );

  const drawerContent = (
    <Box sx={{ overflow: 'auto' }}>
      <Toolbar />
      <Divider />
      <List>
        {menuItems
          .filter((item) => item.visible)
          .map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => handleNavigate(item.path)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.action.selected,
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color:
                      location.pathname === item.path
                        ? theme.palette.primary.main
                        : theme.palette.text.secondary,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
      </List>
    </Box>
  );

  return (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiBackdrop-root': {
          top: { xs: 56, sm: 64 }, // Position backdrop below AppBar
        },
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: theme.palette.background.paper,
          borderRight: `1px solid ${theme.palette.divider}`,
          top: { xs: 56, sm: 64 }, // Position below AppBar (56px on mobile, 64px on desktop)
          height: { xs: 'calc(100% - 56px)', sm: 'calc(100% - 64px)' }, // Adjust height
        },
      }}
      ModalProps={{
        keepMounted: false,
        // Disable the portal so the Modal stays in the component tree
        // This prevents backdrop click issues after navigation
        disablePortal: true,
      }}
    >
      {drawerContent}
    </Drawer>
  );
}

export { DRAWER_WIDTH };
