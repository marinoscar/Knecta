import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, mockAdminUser } from '../../utils/test-utils';
import { HomeQuickActions } from '../../../components/home/HomeQuickActions';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}));

import { usePermissions } from '../../../hooks/usePermissions';

const mockUsePermissions = vi.mocked(usePermissions);

function makePermissions(isAdmin: boolean) {
  return {
    permissions: new Set<string>(),
    roles: new Set<string>(),
    hasPermission: vi.fn(),
    hasAnyPermission: vi.fn(),
    hasAllPermissions: vi.fn(),
    hasRole: vi.fn(),
    hasAnyRole: vi.fn(),
    isAdmin,
  };
}

describe('HomeQuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePermissions.mockReturnValue(makePermissions(false));
  });

  describe('rendering', () => {
    it('renders the section heading', () => {
      render(<HomeQuickActions />);

      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('renders 4 standard action buttons for non-admin users', () => {
      render(<HomeQuickActions />);

      expect(screen.getByRole('button', { name: /new connection/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generate model/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /new ontology/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start conversation/i })).toBeInTheDocument();
    });

    it('renders inside a Paper component', () => {
      const { container } = render(<HomeQuickActions />);

      const paper = container.querySelector('.MuiPaper-root');
      expect(paper).toBeInTheDocument();
    });
  });

  describe('admin buttons', () => {
    it('shows admin buttons when isAdmin is true', () => {
      mockUsePermissions.mockReturnValue(makePermissions(true));

      render(<HomeQuickActions />, { wrapperOptions: { user: mockAdminUser } });

      expect(screen.getByRole('button', { name: /system settings/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /user management/i })).toBeInTheDocument();
    });

    it('hides admin buttons when isAdmin is false', () => {
      mockUsePermissions.mockReturnValue(makePermissions(false));

      render(<HomeQuickActions />);

      expect(screen.queryByRole('button', { name: /system settings/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /user management/i })).not.toBeInTheDocument();
    });

    it('renders a divider between standard and admin buttons', () => {
      mockUsePermissions.mockReturnValue(makePermissions(true));

      const { container } = render(<HomeQuickActions />, {
        wrapperOptions: { user: mockAdminUser },
      });

      const divider = container.querySelector('.MuiDivider-root');
      expect(divider).toBeInTheDocument();
    });

    it('does not render a divider for non-admin users', () => {
      mockUsePermissions.mockReturnValue(makePermissions(false));

      const { container } = render(<HomeQuickActions />);

      const divider = container.querySelector('.MuiDivider-root');
      expect(divider).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to /connections when New Connection is clicked', async () => {
      const user = userEvent.setup();

      render(<HomeQuickActions />);

      await user.click(screen.getByRole('button', { name: /new connection/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/connections');
    });

    it('navigates to /semantic-models/new when Generate Model is clicked', async () => {
      const user = userEvent.setup();

      render(<HomeQuickActions />);

      await user.click(screen.getByRole('button', { name: /generate model/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/new');
    });

    it('navigates to /ontologies when New Ontology is clicked', async () => {
      const user = userEvent.setup();

      render(<HomeQuickActions />);

      await user.click(screen.getByRole('button', { name: /new ontology/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/ontologies');
    });

    it('navigates to /agent when Start Conversation is clicked', async () => {
      const user = userEvent.setup();

      render(<HomeQuickActions />);

      await user.click(screen.getByRole('button', { name: /start conversation/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/agent');
    });

    it('navigates to /admin/settings when System Settings is clicked (admin)', async () => {
      const user = userEvent.setup();
      mockUsePermissions.mockReturnValue(makePermissions(true));

      render(<HomeQuickActions />, { wrapperOptions: { user: mockAdminUser } });

      await user.click(screen.getByRole('button', { name: /system settings/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/admin/settings');
    });

    it('navigates to /admin/users when User Management is clicked (admin)', async () => {
      const user = userEvent.setup();
      mockUsePermissions.mockReturnValue(makePermissions(true));

      render(<HomeQuickActions />, { wrapperOptions: { user: mockAdminUser } });

      await user.click(screen.getByRole('button', { name: /user management/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/admin/users');
    });
  });

  describe('button styling', () => {
    it('renders buttons as outlined variant', () => {
      render(<HomeQuickActions />);

      const connectionButton = screen.getByRole('button', { name: /new connection/i });
      expect(connectionButton).toHaveClass('MuiButton-outlined');
    });

    it('renders buttons as full width', () => {
      render(<HomeQuickActions />);

      const connectionButton = screen.getByRole('button', { name: /new connection/i });
      expect(connectionButton).toHaveClass('MuiButton-fullWidth');
    });
  });
});
