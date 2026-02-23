import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { SetupStepper } from '../../../components/home/SetupStepper';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('SetupStepper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders the stepper when not all steps are complete', () => {
      const { container } = render(
        <SetupStepper
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      // The component should render (not return null)
      const stepper = container.querySelector('.MuiStepper-root');
      expect(stepper).toBeInTheDocument();
    });

    it('returns null when all steps are complete', () => {
      const { container } = render(
        <SetupStepper
          connectionsTotal={1}
          readyModelsCount={1}
          readyOntologiesCount={1}
          chatsTotal={1}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('still renders when only some steps are complete', () => {
      const { container } = render(
        <SetupStepper
          connectionsTotal={1}
          readyModelsCount={1}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      // At least one occurrence of "Create an ontology" text should exist
      const matches = screen.getAllByText('Create an ontology');
      expect(matches.length).toBeGreaterThan(0);
      // And the stepper should still be rendered
      expect(container.querySelector('.MuiStepper-root')).toBeInTheDocument();
    });
  });

  describe('step labels', () => {
    it('renders all 4 step labels', () => {
      render(
        <SetupStepper
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      expect(screen.getAllByText('Connect a database').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Generate a semantic model').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Create an ontology').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ask a question').length).toBeGreaterThan(0);
    });
  });

  describe('active step', () => {
    it('shows the navigation button for the first incomplete step', () => {
      render(
        <SetupStepper
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      // Step 1 is incomplete, so button for "Connect a database" should appear
      const buttons = screen.getAllByRole('button');
      const connectButton = buttons.find((b) =>
        b.textContent?.toLowerCase().includes('connect a database'),
      );
      expect(connectButton).toBeInTheDocument();
    });

    it('shows navigation button for second step when first is complete', () => {
      render(
        <SetupStepper
          connectionsTotal={1}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const modelButton = buttons.find((b) =>
        b.textContent?.toLowerCase().includes('generate a semantic model'),
      );
      expect(modelButton).toBeInTheDocument();
    });

    it('navigates to /connections when Connect a database button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <SetupStepper
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const connectButton = buttons.find((b) =>
        b.textContent?.toLowerCase().includes('connect a database'),
      );
      expect(connectButton).toBeDefined();
      await user.click(connectButton!);

      expect(mockNavigate).toHaveBeenCalledWith('/connections');
    });

    it('navigates to /semantic-models/new when Generate a semantic model button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <SetupStepper
          connectionsTotal={1}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const modelButton = buttons.find((b) =>
        b.textContent?.toLowerCase().includes('generate a semantic model'),
      );
      expect(modelButton).toBeDefined();
      await user.click(modelButton!);

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/new');
    });

    it('navigates to /ontologies when Create an ontology button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <SetupStepper
          connectionsTotal={1}
          readyModelsCount={1}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const ontologyButton = buttons.find((b) =>
        b.textContent?.toLowerCase().includes('create an ontology'),
      );
      expect(ontologyButton).toBeDefined();
      await user.click(ontologyButton!);

      expect(mockNavigate).toHaveBeenCalledWith('/ontologies');
    });

    it('navigates to /agent when Ask a question button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <SetupStepper
          connectionsTotal={1}
          readyModelsCount={1}
          readyOntologiesCount={1}
          chatsTotal={0}
        />,
      );

      const buttons = screen.getAllByRole('button');
      const askButton = buttons.find((b) =>
        b.textContent?.toLowerCase().includes('ask a question'),
      );
      expect(askButton).toBeDefined();
      await user.click(askButton!);

      expect(mockNavigate).toHaveBeenCalledWith('/agent');
    });
  });

  describe('stepper structure', () => {
    it('renders a MUI Stepper', () => {
      const { container } = render(
        <SetupStepper
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const stepper = container.querySelector('.MuiStepper-root');
      expect(stepper).toBeInTheDocument();
    });

    it('renders inside a Paper component', () => {
      const { container } = render(
        <SetupStepper
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const paper = container.querySelector('.MuiPaper-root');
      expect(paper).toBeInTheDocument();
    });
  });
});
