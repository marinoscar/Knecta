# Data Agent Interactive Charts Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Problem Statement](#problem-statement)
3. [Architecture](#architecture)
4. [Current State Analysis](#current-state-analysis)
5. [Implementation Details](#implementation-details)
6. [Chart Specification Schema](#chart-specification-schema)
7. [Planner Changes](#planner-changes)
8. [Executor Changes](#executor-changes)
9. [Frontend Chart Renderer](#frontend-chart-renderer)
10. [SSE Event Flow](#sse-event-flow)
11. [Prompt Engineering](#prompt-engineering)
12. [File Inventory](#file-inventory)
13. [Testing](#testing)
14. [Commit Sequence](#commit-sequence)
15. [Design Decisions](#design-decisions)
16. [Future Enhancements](#future-enhancements)

---

## Feature Overview

The Data Agent Interactive Charts feature extends the Data Agent with native visualization capabilities, replacing static PNG chart generation with interactive MUI X Charts rendered in the frontend. When the LLM determines a visualization would enhance the answer, it outputs a structured `ChartSpec` that the frontend renders as a theme-aware, interactive chart with hover tooltips, zooming, and responsive layout.

### Core Capabilities

- **Intelligent Visualization Detection**: Planner automatically identifies when questions benefit from charts (comparisons, trends, proportions, rankings)
- **Structured Chart Generation**: LLM uses `withStructuredOutput` to produce ChartSpec JSON instead of Python matplotlib code
- **4 Chart Types**: Bar, Line, Pie, and Scatter charts via MUI X Charts (free tier)
- **Theme-Aware Rendering**: Charts automatically inherit MUI theme colors and respect light/dark mode
- **Interactive Features**: Hover tooltips, data point labels, responsive sizing
- **Minimal Payload**: Structured JSON (~1-5KB) instead of base64 PNG images (~50-200KB)
- **Coexistence with Python Sandbox**: Non-chart analysis still uses the Docker sandbox for statistics and data transformations

### Use Cases

1. **Trend Analysis**: "Show me how sales changed over the last 12 months" → Line chart with months on x-axis
2. **Comparisons**: "Compare revenue by region" → Bar chart with regions sorted by value
3. **Composition**: "What percentage of expenses are salaries?" → Pie chart with category breakdown
4. **Rankings**: "Top 10 customers by order count" → Horizontal bar chart sorted descending
5. **Correlations**: "Relationship between price and quantity sold" → Scatter plot
6. **Combined Analysis**: "Analyze profit margins and show the top 5 products" → Text narrative + bar chart

### Current Limitations

- **MUI X Charts Free Tier**: Advanced chart types (heatmaps, funnel charts, radar) require MUI X Pro license
- **Maximum 8 Pie Slices**: Planner prompt instructs LLM to group remaining slices into "Other"
- **No Multi-Axis Charts**: Single y-axis per chart (limitation of free tier)
- **No Chart Customization**: Users cannot adjust colors, styles, or chart options (future enhancement)
- **PostgreSQL Data Only**: Charts can only visualize data from connected PostgreSQL databases
- **Static Chart Specs**: Once generated, chart specs cannot be edited without re-running the step

---

## Problem Statement

### Current Behavior

The Data Agent can produce visualizations via the Python sandbox:

1. User asks a question requiring a chart
2. Planner creates a step with `strategy: "python"`
3. Executor generates Python matplotlib code via LLM
4. Sandbox executes code, saves PNG at 150 DPI, returns base64 string
5. Base64 string (~50-200KB) embedded in SSE message
6. Frontend renders as `<img src="data:image/png;base64,..." />`

### Problems

1. **Large Payloads**: Base64 PNG images significantly increase message size
2. **No Interactivity**: Static images lack hover tooltips, zooming, data point labels
3. **Theme Mismatch**: Matplotlib uses default colors, doesn't match MUI light/dark theme
4. **Reliability Issues**: LLM-generated Python code can fail (syntax errors, API misuse)
5. **Accessibility**: Static images lack proper alt text and aren't screen-reader friendly
6. **Mobile UX**: Fixed-size PNG images don't scale well on mobile devices

### Desired Behavior

1. User asks a question requiring a chart
2. Planner creates a step with `chartType: "bar"` (or line/pie/scatter)
3. Executor uses `withStructuredOutput` to generate ChartSpec JSON
4. ChartSpec flows through SSE in `step_complete` metadata (~1-5KB)
5. Frontend `ChartRenderer` component renders using MUI X Charts
6. Chart automatically matches theme, supports hover tooltips, responsive sizing

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Question                                │
│  "Compare revenue by region for Q4 2025"                             │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Planner Phase                                   │
│  Analyzes question → Detects comparison pattern                      │
│  Creates PlanStep with:                                              │
│    - strategy: "sql_then_python"                                     │
│    - chartType: "bar"                                                │
│    - expectedOutput: "Bar chart showing revenue by region"           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Navigator Phase                                  │
│  Discovers revenue + region datasets via ontology                    │
│  Outputs JoinPlan with relationships                                 │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SQL Builder Phase                                 │
│  Generates SQL query for revenue by region                           │
│  No chart-specific logic (chartType ignored here)                    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Executor Phase                                  │
│  1. Executes SQL query → 5 rows returned                             │
│  2. Detects step.chartType === "bar"                                 │
│  3. Calls llm.withStructuredOutput(ChartSpecSchema)                  │
│  4. LLM extracts chart data from SQL results                         │
│  5. Returns structured ChartSpec:                                    │
│     {                                                                 │
│       type: "bar",                                                    │
│       title: "Q4 2025 Revenue by Region",                            │
│       categories: ["North", "South", "East", "West"],                │
│       series: [{ label: "Revenue ($M)", data: [12.5, 8.3, ...] }],   │
│       xAxisLabel: "Region",                                           │
│       yAxisLabel: "Revenue ($M)"                                      │
│     }                                                                 │
│  6. Stores in stepResult.chartSpec                                   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Verifier Phase                                   │
│  Validates SQL results (grain, joins, NULLs)                         │
│  No chart-specific validation                                        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Explainer Phase                                  │
│  Generates narrative answer                                          │
│  References chart: "As shown in the chart below..."                  │
│  ChartSpec flows through metadata, not embedded in text              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SSE Stream                                   │
│  Event: message_complete                                             │
│  Metadata: {                                                          │
│    stepResults: [{                                                    │
│      stepId: 1,                                                       │
│      chartSpec: { type: "bar", title: "...", ... }                   │
│    }]                                                                 │
│  }                                                                    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend Rendering                                │
│  1. ChatMessage receives message with metadata                       │
│  2. Renders narrative text via ReactMarkdown                         │
│  3. Maps stepResults → finds chartSpec                               │
│  4. Renders <ChartRenderer chartSpec={...} />                        │
│  5. ChartRenderer uses MUI X BarChart component                      │
│  6. Chart inherits theme colors (primary, secondary, etc.)           │
│  7. User hovers → tooltip shows exact values                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Interaction

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Backend (NestJS + LangGraph)                      │
│                                                                       │
│  types.ts                                                            │
│    ├─ ChartSpec interface                                            │
│    ├─ PlanStep.chartType?: 'bar' | 'line' | 'pie' | 'scatter'        │
│    └─ StepResult.chartSpec?: ChartSpec                               │
│                                                                       │
│  planner.node.ts                                                     │
│    └─ Adds chartType to PlanStepSchema (Zod)                         │
│                                                                       │
│  planner.prompt.ts                                                   │
│    └─ "Visualization Guidance" section                               │
│        └─ When to add chartType + which type to use                  │
│                                                                       │
│  executor.node.ts                                                    │
│    ├─ ChartSpecSchema (Zod validation)                               │
│    ├─ If step.chartType exists:                                      │
│    │   ├─ Call buildChartSpecPrompt()                                │
│    │   ├─ llm.withStructuredOutput(ChartSpecSchema)                  │
│    │   ├─ Store result in stepResult.chartSpec                       │
│    │   └─ Emit tool_end event                                        │
│    └─ Else: Use Python sandbox (existing logic)                      │
│                                                                       │
│  executor.prompt.ts                                                  │
│    └─ buildChartSpecPrompt() function                                │
│        └─ Instructs LLM to extract chart data from results           │
│                                                                       │
│  explainer.prompt.ts                                                 │
│    └─ Updated instructions to reference charts naturally             │
│                                                                       │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ SSE Stream (chartSpec in metadata)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend (React + MUI)                            │
│                                                                       │
│  types/index.ts                                                      │
│    ├─ ChartSpec interface (mirrored from backend)                    │
│    └─ DataChatMessage.metadata.stepResults[].chartSpec              │
│                                                                       │
│  ChartRenderer.tsx (NEW)                                             │
│    ├─ Receives chartSpec prop                                        │
│    ├─ Switch on chartSpec.type:                                      │
│    │   ├─ 'bar' → <BarChart /> from @mui/x-charts                    │
│    │   ├─ 'line' → <LineChart />                                     │
│    │   ├─ 'pie' → <PieChart />                                       │
│    │   └─ 'scatter' → <ScatterChart />                               │
│    ├─ Maps chartSpec fields → chart component props                 │
│    └─ Wraps in Paper with title                                      │
│                                                                       │
│  ChatMessage.tsx                                                     │
│    ├─ Renders narrative text (ReactMarkdown)                         │
│    ├─ Maps message.metadata.stepResults                              │
│    ├─ For each step with chartSpec:                                  │
│    │   └─ <ChartRenderer chartSpec={step.chartSpec} />               │
│    └─ Renders after text, before verification badge                  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Current State Analysis

### Existing Chart Infrastructure (Stays Unchanged)

The Python sandbox chart generation remains for non-interactive analysis:

**Location**: `infra/sandbox/executor.py`

```python
# Auto-detects matplotlib figures
figures = plt.get_fignums()
if figures:
    for i, fignum in enumerate(figures):
        fig = plt.figure(fignum)
        buffer = io.BytesIO()
        fig.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close(fig)
        buffer.seek(0)
        base64_data = base64.b64encode(buffer.read()).decode('utf-8')
        files.append({
            "filename": f"chart_{i}.png",
            "mimeType": "image/png",
            "base64": base64_data
        })
```

**Location**: `apps/api/src/data-agent/agent/tools/run-python.tool.ts`

```typescript
const charts = (result.files || []).map(
  (f) => `data:${f.mimeType};base64,${f.base64}`
);
```

**Location**: `apps/api/src/data-agent/agent/nodes/executor.node.ts` (lines 122-171)

```typescript
// Python execution block
if (step.strategy === 'python' || step.strategy === 'sql_then_python') {
  const pyPrompt = buildPythonGenerationPrompt(/* ... */);
  const pyResult = await sandboxService.executeCode(code, 30);
  const charts = (pyResult.files || []).map(/* base64 encoding */);
  stepResult.pythonResult = { stdout: pyResult.stdout, charts };
}
```

### Existing Frontend Rendering

**Location**: `apps/web/src/components/data-agent/ChatMessage.tsx` (lines 190-220)

```tsx
// ReactMarkdown custom img handler for base64 images
img: ({ node, src, alt, ...props }) => {
  if (!src) return null;
  if (src.startsWith('data:image')) {
    return (
      <Box sx={{ my: 2, maxWidth: '100%', overflow: 'auto' }}>
        <img src={src} alt={alt || 'Chart'} style={{ maxWidth: '100%' }} />
      </Box>
    );
  }
  return <img src={src} alt={alt} {...props} />;
}
```

### What Changes vs What Stays

| Component | Status | Notes |
|-----------|--------|-------|
| Python sandbox (`infra/sandbox/`) | **No Change** | Still used for statistical analysis, data transformations |
| `run-python.tool.ts` | **No Change** | Still converts matplotlib files to base64 for analysis steps |
| `executor.node.ts` Python block | **Modified** | Wrapped in `if (!step.chartType)` to skip for chart steps |
| `executor.node.ts` | **Add New Block** | Chart spec generation before Python block |
| Planner prompt | **Modified** | Add visualization guidance section |
| Planner Zod schema | **Modified** | Add optional `chartType` field |
| Frontend ChatMessage | **Modified** | Add ChartRenderer after ReactMarkdown |
| Frontend types | **Modified** | Add ChartSpec interface and stepResults.chartSpec |
| ChartRenderer component | **New File** | MUI X Charts rendering |

### Current PlanStep and StepResult Types

**Location**: `apps/api/src/data-agent/agent/types.ts` (lines 10-17)

```typescript
export interface PlanStep {
  id: number;
  description: string;
  strategy: 'sql' | 'python' | 'sql_then_python';
  dependsOn: number[];
  datasets: string[];
  expectedOutput: string;
  // chartType: WILL BE ADDED
}
```

**Location**: `apps/api/src/data-agent/agent/types.ts` (lines 68-82)

```typescript
export interface StepResult {
  stepId: number;
  description: string;
  strategy: 'sql' | 'python' | 'sql_then_python';
  sqlResult?: { rowCount: number; columns: string[]; data: string };
  pythonResult?: { stdout: string; charts: string[] };
  // chartSpec: WILL BE ADDED
  error?: string;
}
```

### Installed Packages

**Current** (`apps/web/package.json`):
```json
{
  "@mui/material": "^5.x",
  "@mui/icons-material": "^5.x",
  "@emotion/react": "^11.x",
  "@emotion/styled": "^11.x",
  "react-force-graph-2d": "^1.x"  // For ontology graphs only
}
```

**Required Addition**:
```json
{
  "@mui/x-charts": "^7.x"  // Free tier, no license required
}
```

---

## Implementation Details

### 1. Install MUI X Charts

**Action**: Add dependency to frontend

**File**: `apps/web/package.json`

**Command**:
```bash
cd apps/web && npm install @mui/x-charts
```

**Package Details**:
- **Name**: `@mui/x-charts`
- **License**: MIT (free tier)
- **Size**: ~150KB minified + gzipped
- **Supported Charts**: BarChart, LineChart, PieChart, ScatterChart, SparklineChart
- **Documentation**: https://mui.com/x/react-charts/

**Verification**:
```bash
npm list @mui/x-charts
# Should show: @mui/x-charts@7.x.x
```

---

## Chart Specification Schema

### Backend Type Definitions

**File**: `apps/api/src/data-agent/agent/types.ts`

**Add after line 82** (after StepResult interface):

```typescript
// ─────────────────────────────────────────────────────────────────────
// Chart Specification Types
// ─────────────────────────────────────────────────────────────────────

/**
 * Data series for bar/line charts
 * Each series has a label and array of numeric values (one per category)
 */
export interface ChartSeries {
  /** Series name shown in legend */
  label: string;
  /** Numeric data points, must match length of categories array */
  data: number[];
}

/**
 * Slice for pie charts
 * Each slice has a label and numeric value
 */
export interface ChartSlice {
  /** Slice label */
  label: string;
  /** Slice value (will be converted to percentage automatically) */
  value: number;
}

/**
 * Point for scatter plots
 * Each point has x/y coordinates and optional label
 */
export interface ChartPoint {
  /** X-axis value */
  x: number;
  /** Y-axis value */
  y: number;
  /** Optional point label shown on hover */
  label?: string;
}

/**
 * Structured chart specification generated by LLM
 * Frontend renders this using MUI X Charts
 */
export interface ChartSpec {
  /** Chart type determines which MUI X component to use */
  type: 'bar' | 'line' | 'pie' | 'scatter';

  /** Chart title (max 60 characters, shown above chart) */
  title: string;

  /** X-axis label with units (e.g., "Month", "Region") */
  xAxisLabel?: string;

  /** Y-axis label with units (e.g., "Revenue ($M)", "Count") */
  yAxisLabel?: string;

  /** X-axis category labels (for bar/line charts) */
  categories?: string[];

  /** Data series (for bar/line charts, can have multiple series) */
  series?: ChartSeries[];

  /** Pie chart slices (max 8, remaining grouped as "Other") */
  slices?: ChartSlice[];

  /** Scatter plot points */
  points?: ChartPoint[];

  /** Chart orientation (bar charts only) */
  layout?: 'vertical' | 'horizontal';
}
```

**Update PlanStep interface** (line 10):

```typescript
export interface PlanStep {
  id: number;
  description: string;
  strategy: 'sql' | 'python' | 'sql_then_python';
  dependsOn: number[];
  datasets: string[];
  expectedOutput: string;

  /**
   * Chart type for visualization steps
   * When set, executor will generate a ChartSpec instead of using Python sandbox
   * null/undefined for non-visualization steps
   */
  chartType?: 'bar' | 'line' | 'pie' | 'scatter' | null;
}
```

**Update StepResult interface** (line 68):

```typescript
export interface StepResult {
  stepId: number;
  description: string;
  strategy: 'sql' | 'python' | 'sql_then_python';
  sqlResult?: { rowCount: number; columns: string[]; data: string };
  pythonResult?: { stdout: string; charts: string[] };

  /**
   * Structured chart specification (when step.chartType is set)
   * Frontend renders this using MUI X Charts
   */
  chartSpec?: ChartSpec;

  error?: string;
}
```

### Zod Validation Schema

**File**: `apps/api/src/data-agent/agent/nodes/executor.node.ts`

**Add at top of file** (after imports, before ExecutorNode class):

```typescript
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────
// Chart Specification Validation Schemas
// ─────────────────────────────────────────────────────────────────────

const ChartSeriesSchema = z.object({
  label: z.string().describe('Series name shown in legend'),
  data: z.array(z.number()).describe('Numeric values, one per category'),
});

const ChartSliceSchema = z.object({
  label: z.string().describe('Slice label'),
  value: z.number().describe('Slice value (converted to percentage)'),
});

const ChartPointSchema = z.object({
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  label: z.string().optional().describe('Optional point label for hover tooltip'),
});

/**
 * Zod schema for structured chart generation
 * Used with llm.withStructuredOutput() to force LLM to produce valid ChartSpec
 */
export const ChartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'scatter'])
    .describe('Chart type (determines MUI X component)'),

  title: z.string()
    .max(60)
    .describe('Concise chart title (max 60 chars)'),

  xAxisLabel: z.string().optional()
    .describe('X-axis label with units (e.g., "Month", "Region")'),

  yAxisLabel: z.string().optional()
    .describe('Y-axis label with units (e.g., "Revenue ($M)")'),

  categories: z.array(z.string()).optional()
    .describe('X-axis category labels (for bar/line charts)'),

  series: z.array(ChartSeriesSchema).optional()
    .describe('Data series for bar/line charts (can be multiple)'),

  slices: z.array(ChartSliceSchema).max(8).optional()
    .describe('Pie chart slices (max 8, group remaining as "Other")'),

  points: z.array(ChartPointSchema).optional()
    .describe('Scatter plot points (x/y coordinates)'),

  layout: z.enum(['vertical', 'horizontal']).optional()
    .describe('Chart orientation (bar charts only, default: vertical)'),
});
```

---

## Planner Changes

### 1. Update Zod Schema

**File**: `apps/api/src/data-agent/agent/nodes/planner.node.ts`

**Modify PlanStepSchema** (around line 17, after `expectedOutput` field):

```typescript
const PlanStepSchema = z.object({
  id: z.number().int().positive(),
  description: z.string().min(1),
  strategy: z.enum(['sql', 'python', 'sql_then_python']),
  dependsOn: z.array(z.number().int().nonnegative()),
  datasets: z.array(z.string()),
  expectedOutput: z.string().min(1),

  // NEW FIELD
  chartType: z.enum(['bar', 'line', 'pie', 'scatter'])
    .nullable()
    .optional()
    .describe(
      'Chart type for visualization steps. Set when the step should produce an interactive chart. ' +
      'Use "bar" for comparisons/rankings, "line" for trends, "pie" for proportions (<=6 categories), ' +
      '"scatter" for correlations. Omit or set null for non-visualization steps.'
    ),
});
```

### 2. Update Planner Prompt

**File**: `apps/api/src/data-agent/agent/prompts/planner.prompt.ts`

**Add new section after Guidelines** (after line 47, before the final template string closing):

```typescript
## Visualization Guidance

You MUST include a visualization step (with chartType set) when any of these conditions apply:

1. **Explicit Request**: User explicitly requests a chart, graph, plot, visualization, or visual representation
   - "show me a chart of...", "plot the trend...", "visualize the breakdown..."

2. **Comparisons**: Question involves comparing values across categories
   - Examples: "compare revenue by region", "which product sells more", "rank stores by profit"
   - **chartType: "bar"** (use horizontal layout for rankings/top N)

3. **Trends Over Time**: Question involves temporal patterns or time series
   - Examples: "how did sales change this year", "monthly revenue trend", "growth over quarters"
   - **chartType: "line"**

4. **Proportions/Composition**: Question involves parts of a whole or percentage breakdown
   - Examples: "breakdown of expenses by category", "market share distribution", "what percent..."
   - **chartType: "pie"** (ONLY if result has ≤6 categories; otherwise use bar chart)

5. **Correlations**: Question involves relationship between two numeric variables
   - Examples: "relationship between price and sales", "does discount affect quantity", "correlation..."
   - **chartType: "scatter"**

6. **Rankings/Top N**: Question asks for top/bottom N items by some metric
   - Examples: "top 10 customers", "best performing products", "worst regions"
   - **chartType: "bar"** with layout: "horizontal"

### Strategy Selection with chartType

When adding a visualization step, choose strategy based on data availability:

- **"sql_then_python" + chartType**: Data must be queried from database first
  - SQL executes normally, but Python sandbox is SKIPPED
  - Executor uses structured LLM output to generate ChartSpec from SQL results
  - Example: "Compare Q4 revenue by region" → SQL query + bar chart generation

- **"python" + chartType**: Visualization depends only on prior step results (no new SQL)
  - No SQL execution, no Python sandbox
  - Executor generates ChartSpec directly from prior stepResults
  - Example: Step 1 gets raw data, Step 2 (strategy: python, chartType: bar) visualizes it

### When NOT to Add Visualization

Do NOT add a visualization step when:

- User asks for a specific number or single-value lookup ("what is total revenue?")
- Result is a single row or scalar value (no distribution to visualize)
- User asks a schema exploration question ("what tables exist?", "show me columns")
- Question is purely analytical without comparative/trend/composition aspects
- Result set is too large (>100 categories) — summarize with top N + "Other" instead

### Chart Type Decision Tree

```
Is it a comparison across categories? → bar (vertical or horizontal)
Is it a trend over time? → line
Is it a part-of-whole (≤6 categories)? → pie
Is it a correlation between two variables? → scatter
Is it a ranking/top N? → bar (horizontal layout)
```

### Examples

✅ **Good**: "Compare revenue by region for Q4 2025"
```json
{
  "id": 1,
  "description": "Query revenue by region for Q4 2025 and create bar chart",
  "strategy": "sql_then_python",
  "chartType": "bar",
  "datasets": ["sales"],
  "expectedOutput": "Bar chart showing revenue by region"
}
```

✅ **Good**: "Show monthly sales trend for 2025"
```json
{
  "id": 1,
  "description": "Query monthly sales for 2025 and create line chart",
  "strategy": "sql_then_python",
  "chartType": "line",
  "datasets": ["sales"],
  "expectedOutput": "Line chart showing sales trend over 12 months"
}
```

❌ **Bad**: "What is the total revenue?" (single value, no visualization needed)
```json
{
  "id": 1,
  "description": "Calculate total revenue",
  "strategy": "sql",
  "chartType": null,  // ← Correct, no chart needed
  "datasets": ["sales"],
  "expectedOutput": "Total revenue amount"
}
```

✅ **Good**: "Top 10 customers by order count"
```json
{
  "id": 1,
  "description": "Query top 10 customers and create horizontal bar chart",
  "strategy": "sql_then_python",
  "chartType": "bar",
  "datasets": ["customers", "orders"],
  "expectedOutput": "Horizontal bar chart ranking top 10 customers",
  "layout": "horizontal"
}
```
```

**Update existing strategy description** (around line 42):

Change from:
```
2. Use "python" strategy for: statistical analysis, complex calculations, data transformations.
```

To:
```
2. Use "python" strategy for: statistical analysis, visualization/charts (see Visualization Guidance), complex calculations, data transformations.
```

---

## Executor Changes

### 1. Add Chart Spec Generation Logic

**File**: `apps/api/src/data-agent/agent/nodes/executor.node.ts`

**Location**: After SQL execution block (around line 119), BEFORE the Python execution block (line 122)

**Insert this new block**:

```typescript
      // ──────────────────────────────────────────────────────────────
      // Chart Spec Generation (replaces Python for visualization steps)
      // ──────────────────────────────────────────────────────────────
      if (step.chartType && (stepResult.sqlResult || priorContext)) {
        try {
          const chartPrompt = buildChartSpecPrompt(
            step.description,
            step.chartType,
            stepResult.sqlResult?.data || null,
            priorContext,
          );

          const chartMessages = [new SystemMessage(chartPrompt)];

          // Use withStructuredOutput to force LLM to return valid ChartSpec
          const structuredLlm = llm.withStructuredOutput(ChartSpecSchema, {
            name: 'create_chart',
            includeRaw: true, // Get both parsed result and raw response
          });

          const { response: chartResponse } = await this.tracer.trace<any>(
            {
              phase: 'executor',
              stepId: step.id,
              purpose: `chart_gen_step_${step.id}`,
              structuredOutput: true,
            },
            chartMessages,
            () => structuredLlm.invoke(chartMessages),
          );

          // Store structured chart spec in step result
          stepResult.chartSpec = chartResponse.parsed as ChartSpec;

          // Track token usage
          nodeTokens = mergeTokenUsage(
            nodeTokens,
            extractTokenUsage(chartResponse.raw),
          );

          // Emit tool end event
          this.emit({
            type: 'tool_end',
            phase: 'executor',
            stepId: step.id,
            name: 'create_chart',
            result: `${step.chartType} chart: ${stepResult.chartSpec.title}`,
          });

          // Track tool call for metadata
          trackedToolCalls.push({
            phase: 'executor',
            stepId: step.id,
            name: 'create_chart',
            args: { chartType: step.chartType },
            result: stepResult.chartSpec.title,
          });

          this.logger.debug(
            `Generated ${step.chartType} chart: ${stepResult.chartSpec.title}`,
            { stepId: step.id },
          );
        } catch (chartError) {
          const chartMsg =
            chartError instanceof Error ? chartError.message : String(chartError);

          // Append error to existing error string or create new
          if (!stepResult.error) stepResult.error = '';
          stepResult.error += `Chart Generation Error: ${chartMsg}`;

          this.emit({
            type: 'tool_error',
            phase: 'executor',
            stepId: step.id,
            name: 'create_chart',
            error: chartMsg,
          });

          this.logger.error('Chart spec generation failed', {
            stepId: step.id,
            chartType: step.chartType,
            error: chartMsg,
          });
        }
      }
```

### 2. Modify Python Execution Block

**File**: `apps/api/src/data-agent/agent/nodes/executor.node.ts`

**Location**: Line 122 (start of Python execution block)

**Change from**:
```typescript
      // ── Python Execution ──
      if (step.strategy === 'python' || step.strategy === 'sql_then_python') {
```

**Change to**:
```typescript
      // ──────────────────────────────────────────────────────────────
      // Python Execution (only for non-chart steps)
      // ──────────────────────────────────────────────────────────────
      if (
        (step.strategy === 'python' || step.strategy === 'sql_then_python') &&
        !step.chartType // Skip Python sandbox if this is a chart generation step
      ) {
```

**Explanation**: This ensures that when `chartType` is set, the executor generates a ChartSpec via structured LLM output instead of running Python code in the sandbox. The Python sandbox remains available for non-chart analysis steps.

---

## Prompt Engineering

### Chart Spec Generation Prompt

**File**: `apps/api/src/data-agent/agent/prompts/executor.prompt.ts`

**Add this new exported function** (after the existing `buildPythonGenerationPrompt` function):

```typescript
/**
 * Builds prompt for structured chart spec generation
 * Used with llm.withStructuredOutput() to extract chart data from SQL/Python results
 */
export function buildChartSpecPrompt(
  stepDescription: string,
  chartType: string,
  sqlData: string | null,
  priorContext: string,
): string {
  return `You are a data visualization expert. Extract chart data from the execution results and output a structured chart specification.

## Task Description
${stepDescription}

## Chart Type Required
${chartType}

${sqlData ? `## SQL Query Results\n\`\`\`\n${sqlData}\n\`\`\`` : ''}

${priorContext ? `## Results from Prior Steps\n${priorContext}` : ''}

## Extraction Rules

### General Rules (All Chart Types)
1. Extract ONLY the data needed for the ${chartType} chart from the results above
2. Keep all labels concise (max 25 characters) — truncate or abbreviate long names
3. Round all numbers to 2 decimal places maximum
4. For rankings or "top N" analysis, order data by value descending
5. Ensure all arrays are the same length where required (e.g., categories and series data)
6. Use descriptive but concise title (max 60 characters)
7. Include units in axis labels where appropriate (e.g., "Revenue ($M)", "Count")

### Bar Chart Rules (type: "bar")
- Provide **categories** array (x-axis labels as strings)
- Provide **series** array (one or more series, each with label and data array)
- Each series data array must have same length as categories array
- Use **layout: "horizontal"** for rankings or when category labels are long (>15 chars)
- Use **layout: "vertical"** (default) for time series or short category names
- Order categories logically (chronological for time, descending by value for rankings)

### Line Chart Rules (type: "line")
- Provide **categories** array (x-axis labels, typically time periods)
- Provide **series** array (one or more trend lines)
- Each series data array must match categories array length
- Preserve time ordering in categories (do NOT sort by value)
- Use clear time labels (e.g., "Jan 2025", "Q1", "Week 1")

### Pie Chart Rules (type: "pie")
- Provide **slices** array with label and value for each slice
- Maximum 8 slices — if more, keep top 7 by value and group remaining as "Other"
- Order slices by value descending
- Ensure all values are positive (pie charts cannot show negative values)
- Do NOT use pie charts for temporal data (use line chart instead)

### Scatter Plot Rules (type: "scatter")
- Provide **points** array with x and y coordinates
- Optionally include **label** for each point (shown on hover tooltip)
- Ensure x and y are numeric values
- Use axis labels to describe what x and y represent

## Output Format

You MUST return a valid JSON object matching the ChartSpec schema. The schema validator will enforce:
- \`type\` is one of: bar, line, pie, scatter
- \`title\` is a non-empty string (max 60 chars)
- For bar/line: both \`categories\` and \`series\` are present and arrays match in length
- For pie: \`slices\` array is present with max 8 items
- For scatter: \`points\` array is present with numeric x/y values

## Example Outputs

### Bar Chart Example
\`\`\`json
{
  "type": "bar",
  "title": "Q4 2025 Revenue by Region",
  "xAxisLabel": "Region",
  "yAxisLabel": "Revenue ($M)",
  "categories": ["North", "South", "East", "West", "Central"],
  "series": [
    {
      "label": "Revenue ($M)",
      "data": [12.5, 8.3, 15.7, 9.2, 11.1]
    }
  ],
  "layout": "vertical"
}
\`\`\`

### Line Chart Example
\`\`\`json
{
  "type": "line",
  "title": "Monthly Sales Trend 2025",
  "xAxisLabel": "Month",
  "yAxisLabel": "Sales ($K)",
  "categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  "series": [
    {
      "label": "Sales ($K)",
      "data": [45.2, 52.1, 48.9, 61.3, 58.7, 64.5]
    }
  ]
}
\`\`\`

### Pie Chart Example
\`\`\`json
{
  "type": "pie",
  "title": "Expense Breakdown by Category",
  "slices": [
    { "label": "Salaries", "value": 125000 },
    { "label": "Marketing", "value": 45000 },
    { "label": "Operations", "value": 32000 },
    { "label": "R&D", "value": 28000 },
    { "label": "Other", "value": 15000 }
  ]
}
\`\`\`

### Scatter Plot Example
\`\`\`json
{
  "type": "scatter",
  "title": "Price vs Quantity Sold",
  "xAxisLabel": "Unit Price ($)",
  "yAxisLabel": "Quantity Sold",
  "points": [
    { "x": 9.99, "y": 1250, "label": "Product A" },
    { "x": 14.99, "y": 890, "label": "Product B" },
    { "x": 19.99, "y": 650, "label": "Product C" },
    { "x": 24.99, "y": 420, "label": "Product D" }
  ]
}
\`\`\`

Now extract the chart data from the results above and return a valid ChartSpec JSON object.`;
}
```

### Explainer Prompt Updates

**File**: `apps/api/src/data-agent/agent/prompts/explainer.prompt.ts`

**Modify the step results description section** (around lines 11-22):

**Find the code block that builds the stepResults description**:

```typescript
const resultsDescription = state.stepResults
  .map((r, idx) => {
    let detail = `**Step ${r.stepId}**: ${r.description} (strategy: ${r.strategy})`;
    if (r.sqlResult) {
      detail += `\n- SQL returned ${r.sqlResult.rowCount} rows`;
    }
    if (r.pythonResult) {
      const chartCount = r.pythonResult.charts?.length || 0;
      detail += `\n- Python analysis completed${chartCount > 0 ? ` with ${chartCount} chart(s)` : ''}`;
    }
    // ADD THIS BLOCK ↓
    if (r.chartSpec) {
      detail += `\n- **Interactive Chart**: ${r.chartSpec.type} chart titled "${r.chartSpec.title}" (rendered below your narrative)`;
    }
    // END NEW BLOCK ↑
    if (r.error) {
      detail += `\n- ⚠️ Error: ${r.error}`;
    }
    return detail;
  })
  .join('\n\n');
```

**Modify instruction #4** (around line 56):

**Change from**:
```
4. Include any charts generated during execution as inline images.
```

**Change to**:
```
4. **Chart References**: If any steps generated interactive charts (chartSpec present), reference them naturally in your narrative (e.g., "As shown in the chart below...", "The visualization reveals..."). Charts are rendered as interactive components below your text — do NOT embed markdown image tags or attempt to describe the chart structure.
5. **Missing Visualizations**: If no charts were generated but the data would clearly benefit from visualization (trends, comparisons, distributions), briefly mention this as a suggestion for follow-up.
```

**Note**: The explainer.node.ts does NOT need changes to the chart collection logic (lines 44-50) because MUI charts flow through `stepResult.chartSpec` in metadata, not embedded in the narrative text.

---

## Frontend Chart Renderer

### 1. TypeScript Types

**File**: `apps/web/src/types/index.ts`

**Add after the DataChatMessage interface** (around line 440):

```typescript
// ─────────────────────────────────────────────────────────────────────
// Chart Specification Types (mirrored from backend)
// ─────────────────────────────────────────────────────────────────────

export interface ChartSeries {
  label: string;
  data: number[];
}

export interface ChartSlice {
  label: string;
  value: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories?: string[];
  series?: ChartSeries[];
  slices?: ChartSlice[];
  points?: ChartPoint[];
  layout?: 'vertical' | 'horizontal';
}
```

**Update DataChatMessage.metadata.stepResults type** (around line 434):

```typescript
stepResults?: Array<{
  stepId: number;
  description: string;
  strategy: string;
  sqlResult?: { rowCount: number; columns: string[]; data: string };
  pythonResult?: { stdout: string; charts: string[] };
  chartSpec?: ChartSpec; // ADD THIS LINE
  error?: string;
}>;
```

### 2. ChartRenderer Component (New File)

**File**: `apps/web/src/components/data-agent/ChartRenderer.tsx` (NEW)

**Full component implementation**:

```typescript
import { Box, Paper, Typography, useTheme } from '@mui/material';
import { BarChart, LineChart, PieChart, ScatterChart } from '@mui/x-charts';
import type { ChartSpec } from '../../types';

interface ChartRendererProps {
  chartSpec: ChartSpec;
}

/**
 * Renders interactive MUI X Charts from structured ChartSpec
 * Automatically inherits MUI theme colors and respects light/dark mode
 */
export function ChartRenderer({ chartSpec }: ChartRendererProps) {
  const theme = useTheme();
  const chartHeight = 350;

  // Common container styling
  const containerSx = {
    p: 2,
    my: 2,
    bgcolor: theme.palette.background.paper,
    borderRadius: 1,
  };

  // Common title styling
  const titleSx = {
    fontWeight: 600,
    color: theme.palette.text.primary,
    mb: 1,
  };

  switch (chartSpec.type) {
    case 'bar': {
      return (
        <Paper sx={containerSx} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={titleSx}>
            {chartSpec.title}
          </Typography>
          <BarChart
            height={chartHeight}
            series={(chartSpec.series || []).map((s) => ({
              data: s.data,
              label: s.label,
            }))}
            xAxis={[
              {
                data: chartSpec.categories || [],
                scaleType: 'band' as const,
                label: chartSpec.xAxisLabel,
              },
            ]}
            yAxis={[{ label: chartSpec.yAxisLabel }]}
            layout={chartSpec.layout}
            slotProps={{
              legend: {
                direction: 'row',
                position: { vertical: 'top', horizontal: 'right' },
              },
            }}
          />
        </Paper>
      );
    }

    case 'line': {
      return (
        <Paper sx={containerSx} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={titleSx}>
            {chartSpec.title}
          </Typography>
          <LineChart
            height={chartHeight}
            series={(chartSpec.series || []).map((s) => ({
              data: s.data,
              label: s.label,
              showMark: true,
            }))}
            xAxis={[
              {
                data: chartSpec.categories || [],
                scaleType: 'band' as const,
                label: chartSpec.xAxisLabel,
              },
            ]}
            yAxis={[{ label: chartSpec.yAxisLabel }]}
            slotProps={{
              legend: {
                direction: 'row',
                position: { vertical: 'top', horizontal: 'right' },
              },
            }}
          />
        </Paper>
      );
    }

    case 'pie': {
      return (
        <Paper sx={containerSx} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={titleSx}>
            {chartSpec.title}
          </Typography>
          <PieChart
            height={chartHeight}
            series={[
              {
                data: (chartSpec.slices || []).map((s, i) => ({
                  id: i,
                  value: s.value,
                  label: s.label,
                })),
                highlightScope: { faded: 'global', highlighted: 'item' },
                faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
              },
            ]}
            slotProps={{
              legend: {
                direction: 'column',
                position: { vertical: 'middle', horizontal: 'right' },
                padding: 0,
              },
            }}
          />
        </Paper>
      );
    }

    case 'scatter': {
      return (
        <Paper sx={containerSx} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={titleSx}>
            {chartSpec.title}
          </Typography>
          <ScatterChart
            height={chartHeight}
            series={[
              {
                data: (chartSpec.points || []).map((p) => ({
                  x: p.x,
                  y: p.y,
                  id: p.label || `${p.x},${p.y}`,
                })),
              },
            ]}
            xAxis={[{ label: chartSpec.xAxisLabel }]}
            yAxis={[{ label: chartSpec.yAxisLabel }]}
          />
        </Paper>
      );
    }

    default:
      return null;
  }
}
```

**Key Features**:
- Wraps each chart in MUI Paper component for consistent styling
- Uses theme colors automatically (no hardcoded colors)
- Adds chart title above the chart
- Configures legend positioning for optimal layout
- Line charts show data point markers
- Pie charts have hover highlighting effect
- Scatter charts use point labels for hover tooltips

### 3. Integrate into ChatMessage

**File**: `apps/web/src/components/data-agent/ChatMessage.tsx`

**Step 1: Add import** (at top of file):

```typescript
import { ChartRenderer } from './ChartRenderer';
```

**Step 2: Render charts after ReactMarkdown** (around line 256, after the ReactMarkdown block and before the ClarificationCard):

```typescript
        </ReactMarkdown>
      </Box>

      {/* Interactive Charts from Step Results */}
      {message.metadata?.stepResults?.map((step) =>
        step.chartSpec ? (
          <Box key={`chart-${step.stepId}`}>
            <ChartRenderer chartSpec={step.chartSpec} />
          </Box>
        ) : null
      )}

      {/* Clarification Card */}
      {message.status === 'clarification_needed' && (
```

**Layout Flow**:
```
ChatMessage Component
├─ Avatar (left side)
└─ Message Content (right side)
   ├─ ReactMarkdown (narrative text)
   ├─ Interactive Charts (from ChartRenderer) ← NEW
   ├─ ClarificationCard (if clarification_needed)
   ├─ Verification Badge (if verification report exists)
   ├─ Data Lineage (if data lineage exists)
   └─ Tool Call Accordion (if tool calls exist)
```

---

## SSE Event Flow

### No New Event Types Required

Chart specs flow through **existing SSE events** via metadata:

**Event**: `step_complete`
```typescript
{
  type: 'step_complete',
  phase: 'executor',
  stepId: 1,
  description: "Query revenue by region and create bar chart",
  strategy: "sql_then_python",
  sqlResult: { rowCount: 5, columns: [...], data: "..." },
  chartSpec: {  // NEW FIELD
    type: "bar",
    title: "Q4 2025 Revenue by Region",
    categories: ["North", "South", "East", "West", "Central"],
    series: [{ label: "Revenue ($M)", data: [12.5, 8.3, 15.7, 9.2, 11.1] }],
    xAxisLabel: "Region",
    yAxisLabel: "Revenue ($M)"
  }
}
```

**Event**: `message_complete`
```typescript
{
  type: 'message_complete',
  role: 'assistant',
  content: "Here's the revenue breakdown by region for Q4 2025:\n\n...",
  metadata: {
    stepResults: [
      {
        stepId: 1,
        description: "Query revenue by region and create bar chart",
        strategy: "sql_then_python",
        sqlResult: { rowCount: 5, ... },
        chartSpec: { type: "bar", title: "...", ... }  // NEW FIELD
      }
    ],
    toolCalls: [
      { phase: 'executor', stepId: 1, name: 'query_database', ... },
      { phase: 'executor', stepId: 1, name: 'create_chart', args: { chartType: 'bar' }, result: 'Q4 2025 Revenue by Region' }
    ],
    ...
  }
}
```

**Event**: `tool_end` (new tool call tracking for chart generation)
```typescript
{
  type: 'tool_end',
  phase: 'executor',
  stepId: 1,
  name: 'create_chart',
  result: "bar chart: Q4 2025 Revenue by Region"
}
```

### Backend Event Emission

No changes needed to SSE infrastructure. Chart specs automatically flow through existing event emitters:

**File**: `apps/api/src/data-agent/agent/nodes/executor.node.ts`

```typescript
// After chart spec generation
this.emit({
  type: 'tool_end',
  phase: 'executor',
  stepId: step.id,
  name: 'create_chart',
  result: `${step.chartType} chart: ${stepResult.chartSpec.title}`,
});

// At end of executor node
this.emit({
  type: 'step_complete',
  phase: 'executor',
  stepId: step.id,
  description: step.description,
  strategy: step.strategy,
  sqlResult: stepResult.sqlResult,
  chartSpec: stepResult.chartSpec, // Flows to frontend
  error: stepResult.error,
});
```

---

## File Inventory

### Backend Files

| File Path | Action | Description |
|-----------|--------|-------------|
| `apps/api/src/data-agent/agent/types.ts` | **Modify** | Add ChartSpec, ChartSeries, ChartSlice, ChartPoint interfaces; add chartType to PlanStep; add chartSpec to StepResult |
| `apps/api/src/data-agent/agent/nodes/planner.node.ts` | **Modify** | Add chartType field to PlanStepSchema (Zod) |
| `apps/api/src/data-agent/agent/prompts/planner.prompt.ts` | **Modify** | Add "Visualization Guidance" section with rules for when to set chartType |
| `apps/api/src/data-agent/agent/nodes/executor.node.ts` | **Modify** | Add ChartSpecSchema (Zod); add chart spec generation block; modify Python block condition |
| `apps/api/src/data-agent/agent/prompts/executor.prompt.ts` | **Modify** | Add buildChartSpecPrompt() function |
| `apps/api/src/data-agent/agent/prompts/explainer.prompt.ts` | **Modify** | Update step result description to mention charts; update chart reference instructions |

### Frontend Files

| File Path | Action | Description |
|-----------|--------|-------------|
| `apps/web/package.json` | **Modify** | Add @mui/x-charts dependency |
| `apps/web/src/types/index.ts` | **Modify** | Add ChartSpec, ChartSeries, ChartSlice, ChartPoint; update DataChatMessage.metadata.stepResults |
| `apps/web/src/components/data-agent/ChartRenderer.tsx` | **NEW** | MUI X Charts rendering component with switch for bar/line/pie/scatter |
| `apps/web/src/components/data-agent/ChatMessage.tsx` | **Modify** | Import ChartRenderer; map stepResults to render charts after ReactMarkdown |

### Files NOT Changed

| File Path | Reason |
|-----------|--------|
| `infra/sandbox/executor.py` | Python sandbox still used for non-chart analysis (statistics, transformations) |
| `apps/api/src/data-agent/agent/tools/run-python.tool.ts` | Still converts matplotlib figures to base64 for analysis steps without chartType |
| `apps/api/src/data-agent/agent/state.ts` | No new state fields needed; chartSpec flows through existing StepResult in stepResults array |
| `apps/api/src/data-agent/agent/nodes/navigator.node.ts` | Navigator doesn't need chart awareness; works the same |
| `apps/api/src/data-agent/agent/nodes/sql-builder.node.ts` | SQL builder doesn't need chart awareness; chartType is for executor only |
| `apps/api/src/data-agent/agent/nodes/verifier.node.ts` | Verifier validates SQL results regardless of visualization |
| `apps/api/src/data-agent/agent/nodes/explainer.node.ts` | Only prompt changes; node logic unchanged (chart embedding removed) |
| `apps/api/src/data-agent/data-agent.controller.ts` | No API endpoint changes |
| `apps/api/src/data-agent/data-agent.service.ts` | No service logic changes |
| Database migrations | No schema changes; chartSpec flows only in runtime metadata |

---

## Testing

### Backend Unit Tests

**File**: `apps/api/src/data-agent/agent/nodes/__tests__/planner.node.spec.ts`

**New test cases**:

```typescript
describe('Planner chartType field', () => {
  it('should set chartType: "bar" for comparison questions', async () => {
    const question = 'Compare revenue by region for Q4 2025';
    // ... invoke planner node
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].chartType).toBe('bar');
  });

  it('should set chartType: "line" for trend questions', async () => {
    const question = 'Show me monthly sales trend for 2025';
    // ... invoke planner node
    expect(result.plan.steps[0].chartType).toBe('line');
  });

  it('should set chartType: "pie" for composition questions', async () => {
    const question = 'Breakdown of expenses by category';
    // ... invoke planner node
    expect(result.plan.steps[0].chartType).toBe('pie');
  });

  it('should set chartType: null for single-value questions', async () => {
    const question = 'What is the total revenue?';
    // ... invoke planner node
    expect(result.plan.steps[0].chartType).toBeNull();
  });

  it('should use "horizontal" layout for ranking questions', async () => {
    const question = 'Top 10 customers by order count';
    // ... invoke planner node
    expect(result.plan.steps[0].chartType).toBe('bar');
    expect(result.plan.steps[0].layout).toBe('horizontal');
  });
});
```

**File**: `apps/api/src/data-agent/agent/nodes/__tests__/executor.node.spec.ts`

**New test cases**:

```typescript
describe('Executor chart generation', () => {
  it('should generate bar chart spec for step with chartType', async () => {
    const step = {
      id: 1,
      description: 'Create revenue by region chart',
      strategy: 'sql_then_python' as const,
      chartType: 'bar' as const,
      datasets: ['sales'],
      dependsOn: [],
      expectedOutput: 'Bar chart',
    };
    const sqlResult = { rowCount: 3, columns: ['region', 'revenue'], data: 'North,100\nSouth,80\nEast,120' };

    // ... invoke executor with mocked LLM returning ChartSpec

    expect(result.stepResults[0].chartSpec).toBeDefined();
    expect(result.stepResults[0].chartSpec?.type).toBe('bar');
    expect(result.stepResults[0].chartSpec?.categories).toEqual(['North', 'South', 'East']);
    expect(result.stepResults[0].chartSpec?.series[0].data).toEqual([100, 80, 120]);
  });

  it('should NOT run Python sandbox for steps with chartType', async () => {
    const step = { /* ... chartType: 'line' ... */ };
    const mockSandbox = jest.spyOn(sandboxService, 'executeCode');

    // ... invoke executor

    expect(mockSandbox).not.toHaveBeenCalled();
  });

  it('should still run Python sandbox for steps without chartType', async () => {
    const step = { /* ... chartType: null, strategy: 'python' ... */ };
    const mockSandbox = jest.spyOn(sandboxService, 'executeCode');

    // ... invoke executor

    expect(mockSandbox).toHaveBeenCalled();
  });

  it('should handle chart generation errors gracefully', async () => {
    const step = { /* ... chartType: 'bar' ... */ };
    // Mock LLM to throw error

    // ... invoke executor

    expect(result.stepResults[0].error).toContain('Chart Generation Error');
    expect(result.stepResults[0].chartSpec).toBeUndefined();
  });
});
```

**File**: `apps/api/src/data-agent/agent/prompts/__tests__/executor.prompt.spec.ts`

**New test cases**:

```typescript
describe('buildChartSpecPrompt', () => {
  it('should include chart type and SQL data in prompt', () => {
    const prompt = buildChartSpecPrompt(
      'Create revenue chart',
      'bar',
      'region,revenue\nNorth,100\nSouth,80',
      ''
    );

    expect(prompt).toContain('bar');
    expect(prompt).toContain('region,revenue');
    expect(prompt).toContain('North,100');
  });

  it('should include bar chart rules for bar type', () => {
    const prompt = buildChartSpecPrompt('...', 'bar', null, '');
    expect(prompt).toContain('categories');
    expect(prompt).toContain('series');
    expect(prompt).toContain('layout');
  });

  it('should include pie chart rules for pie type', () => {
    const prompt = buildChartSpecPrompt('...', 'pie', null, '');
    expect(prompt).toContain('slices');
    expect(prompt).toContain('max 8');
  });
});
```

### Frontend Component Tests

**File**: `apps/web/src/components/data-agent/__tests__/ChartRenderer.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme, darkTheme } from '../../../theme';
import { ChartRenderer } from '../ChartRenderer';

describe('ChartRenderer', () => {
  const barChartSpec = {
    type: 'bar' as const,
    title: 'Test Bar Chart',
    xAxisLabel: 'Categories',
    yAxisLabel: 'Values',
    categories: ['A', 'B', 'C'],
    series: [{ label: 'Series 1', data: [10, 20, 30] }],
  };

  it('should render bar chart with correct title', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <ChartRenderer chartSpec={barChartSpec} />
      </ThemeProvider>
    );

    expect(screen.getByText('Test Bar Chart')).toBeInTheDocument();
  });

  it('should render line chart', () => {
    const lineChartSpec = {
      type: 'line' as const,
      title: 'Test Line Chart',
      categories: ['Jan', 'Feb', 'Mar'],
      series: [{ label: 'Sales', data: [100, 150, 120] }],
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <ChartRenderer chartSpec={lineChartSpec} />
      </ThemeProvider>
    );

    expect(screen.getByText('Test Line Chart')).toBeInTheDocument();
  });

  it('should render pie chart', () => {
    const pieChartSpec = {
      type: 'pie' as const,
      title: 'Test Pie Chart',
      slices: [
        { label: 'A', value: 30 },
        { label: 'B', value: 70 },
      ],
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <ChartRenderer chartSpec={pieChartSpec} />
      </ThemeProvider>
    );

    expect(screen.getByText('Test Pie Chart')).toBeInTheDocument();
  });

  it('should render scatter chart', () => {
    const scatterChartSpec = {
      type: 'scatter' as const,
      title: 'Test Scatter Plot',
      xAxisLabel: 'X Values',
      yAxisLabel: 'Y Values',
      points: [
        { x: 1, y: 2, label: 'Point A' },
        { x: 3, y: 4, label: 'Point B' },
      ],
    };

    render(
      <ThemeProvider theme={lightTheme}>
        <ChartRenderer chartSpec={scatterChartSpec} />
      </ThemeProvider>
    );

    expect(screen.getByText('Test Scatter Plot')).toBeInTheDocument();
  });

  it('should use theme colors in light mode', () => {
    const { container } = render(
      <ThemeProvider theme={lightTheme}>
        <ChartRenderer chartSpec={barChartSpec} />
      </ThemeProvider>
    );

    const paper = container.querySelector('.MuiPaper-root');
    expect(paper).toHaveStyle({ backgroundColor: lightTheme.palette.background.paper });
  });

  it('should use theme colors in dark mode', () => {
    const { container } = render(
      <ThemeProvider theme={darkTheme}>
        <ChartRenderer chartSpec={barChartSpec} />
      </ThemeProvider>
    );

    const paper = container.querySelector('.MuiPaper-root');
    expect(paper).toHaveStyle({ backgroundColor: darkTheme.palette.background.paper });
  });

  it('should return null for unsupported chart type', () => {
    const invalidSpec = { type: 'unsupported' as any, title: 'Invalid' };
    const { container } = render(
      <ThemeProvider theme={lightTheme}>
        <ChartRenderer chartSpec={invalidSpec} />
      </ThemeProvider>
    );

    expect(container.firstChild).toBeNull();
  });
});
```

**File**: `apps/web/src/components/data-agent/__tests__/ChatMessage.test.tsx`

**Add new test cases**:

```typescript
describe('ChatMessage chart rendering', () => {
  it('should render ChartRenderer when stepResults contain chartSpec', () => {
    const messageWithChart = {
      id: '1',
      chatId: 'chat-1',
      role: 'assistant' as const,
      content: 'Here is the chart:',
      status: 'complete' as const,
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Create chart',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'bar' as const,
              title: 'Test Chart',
              categories: ['A', 'B'],
              series: [{ label: 'Data', data: [10, 20] }],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={messageWithChart} />);

    expect(screen.getByText('Test Chart')).toBeInTheDocument();
  });

  it('should NOT render ChartRenderer when no chartSpec present', () => {
    const messageWithoutChart = {
      /* ... no chartSpec in stepResults ... */
    };

    const { container } = render(<ChatMessage message={messageWithoutChart} />);

    expect(container.querySelector('.MuiPaper-root')).not.toBeInTheDocument();
  });

  it('should render multiple charts from multiple steps', () => {
    const messageWithMultipleCharts = {
      /* ... stepResults with 2 chartSpecs ... */
    };

    render(<ChatMessage message={messageWithMultipleCharts} />);

    expect(screen.getByText('Chart 1 Title')).toBeInTheDocument();
    expect(screen.getByText('Chart 2 Title')).toBeInTheDocument();
  });
});
```

### Manual E2E Testing

**Test Plan**:

| Test Case | Input Question | Expected Result |
|-----------|----------------|-----------------|
| **Comparison Chart** | "Compare revenue by region for Q4 2025" | Interactive bar chart with regions on x-axis, revenue on y-axis |
| **Trend Chart** | "Show me monthly sales trend for 2025" | Interactive line chart with months on x-axis |
| **Pie Chart** | "Breakdown of expenses by category" | Interactive pie chart with ≤8 slices |
| **Ranking Chart** | "Top 10 customers by order count" | Horizontal bar chart sorted descending |
| **Scatter Plot** | "Relationship between price and quantity sold" | Scatter plot with hover labels |
| **Single Value** | "What is total revenue?" | Text answer only, NO chart |
| **Theme Toggle** | Create chart → toggle dark mode | Chart colors update immediately |
| **Mobile Responsive** | View chart on narrow screen | Chart resizes to fit viewport |
| **Hover Tooltips** | Hover over bar/line/pie | Tooltip shows exact value |
| **Multiple Charts** | "Show revenue by region AND sales trend" | Two separate charts rendered |

**Verification Checklist**:
- [ ] Charts inherit MUI theme colors (primary, secondary, etc.)
- [ ] Charts update when theme switches light ↔ dark
- [ ] Hover tooltips appear with correct values
- [ ] Chart titles display above charts
- [ ] Axis labels include units where provided
- [ ] Pie charts show percentages on hover
- [ ] Charts render below narrative text, before verification badge
- [ ] No base64 images in message content (inspect network tab)
- [ ] ChartSpec in SSE metadata is < 5KB (inspect network tab)
- [ ] Python sandbox still works for non-chart analysis steps

---

## Commit Sequence

Follow the mandatory commit-only git rules from CLAUDE.md:

1. **Backend types and schema**
   ```
   feat(api): add ChartSpec types and chartType to PlanStep/StepResult
   ```
   Files: `types.ts`, `planner.node.ts` (Zod schema only)

2. **Planner prompt guidance**
   ```
   feat(api): add visualization guidance to planner prompt
   ```
   Files: `planner.prompt.ts`

3. **Executor chart generation**
   ```
   feat(api): generate structured chart specs in executor node
   ```
   Files: `executor.node.ts` (ChartSpecSchema, chart generation block, Python condition change)

4. **Chart spec prompt**
   ```
   feat(api): add buildChartSpecPrompt for chart data extraction
   ```
   Files: `executor.prompt.ts`

5. **Explainer prompt updates**
   ```
   feat(api): update explainer prompt to reference interactive charts
   ```
   Files: `explainer.prompt.ts`

6. **Frontend package installation**
   ```
   chore(web): install @mui/x-charts dependency
   ```
   Files: `package.json`, `package-lock.json`

7. **Frontend types**
   ```
   feat(web): add ChartSpec types and update DataChatMessage
   ```
   Files: `types/index.ts`

8. **ChartRenderer component**
   ```
   feat(web): add ChartRenderer component with MUI X Charts
   ```
   Files: `components/data-agent/ChartRenderer.tsx` (new file)

9. **ChatMessage integration**
   ```
   feat(web): render interactive charts in ChatMessage
   ```
   Files: `components/data-agent/ChatMessage.tsx`

10. **Backend tests**
    ```
    test(api): add tests for chart spec generation and prompts
    ```
    Files: `__tests__/planner.node.spec.ts`, `__tests__/executor.node.spec.ts`, `__tests__/executor.prompt.spec.ts`

11. **Frontend tests**
    ```
    test(web): add ChartRenderer and ChatMessage chart tests
    ```
    Files: `__tests__/ChartRenderer.test.tsx`, `__tests__/ChatMessage.test.tsx`

---

## Design Decisions

### 1. Why MUI X Charts over Other Libraries?

**Alternatives Considered**:
- **Recharts**: Popular, React-native, but requires manual theming
- **Chart.js + react-chartjs-2**: Feature-rich, but not MUI-native
- **Victory Charts**: Flexible, but heavyweight and complex API
- **Nivo**: Beautiful defaults, but not designed for MUI integration

**Why MUI X Charts**:
- **Zero-config theming**: Automatically inherits MUI palette colors
- **Consistent design**: Matches existing MUI components (Paper, Typography, etc.)
- **Free tier sufficient**: Bar, Line, Pie, Scatter cover 90% of use cases
- **Maintained by MUI team**: Same team that maintains @mui/material
- **TypeScript-first**: Full type safety out of the box
- **Responsive by default**: Charts resize automatically
- **Accessibility**: Built-in ARIA labels and keyboard navigation

### 2. Why Structured Output Instead of Python Code?

**Python Approach** (old way):
```
User question → LLM generates Python code → Sandbox executes → matplotlib PNG → base64 → frontend
```
**Problems**: LLM can produce invalid Python, matplotlib styling doesn't match theme, large payloads

**Structured Output Approach** (new way):
```
User question → LLM outputs ChartSpec JSON → Frontend renders with MUI X Charts
```
**Benefits**:
- **Reliability**: Zod schema validation ensures valid chart specs
- **Smaller payloads**: JSON ~1-5KB vs PNG ~50-200KB (10-50x reduction)
- **Interactivity**: Native hover tooltips, zooming, responsive sizing
- **Theming**: Automatic light/dark mode support
- **Accessibility**: Screen-reader friendly, keyboard navigation

### 3. Why chartType on PlanStep Instead of Detecting Later?

**Alternative**: Executor could detect visualization needs from SQL results

**Why Early Detection (Planner)**:
- **Intent clarity**: Visualization is part of the plan, not a side effect
- **Prompt optimization**: Planner can set expectations in step description
- **Skip Python sandbox**: Executor knows upfront to use structured output
- **Audit trail**: chartType visible in plan artifacts and SSE events

### 4. Why Coexist with Python Sandbox Instead of Replacing?

**Python sandbox remains for**:
- Statistical analysis (mean, median, std dev, correlation)
- Data transformations (grouping, pivoting, merging)
- Complex calculations not expressible in SQL
- Future: Custom matplotlib charts for advanced users (optional)

**MUI X Charts replace Python for**:
- Interactive frontend charts (bar, line, pie, scatter)
- Theme-aware visualizations
- Standard analytical visualizations

### 5. Why Maximum 8 Pie Slices?

- **Cognitive load**: More than 8 slices become hard to distinguish visually
- **Legend readability**: MUI X Charts legend becomes crowded with >8 items
- **Best practice**: Data visualization experts recommend limiting pie slices
- **Mitigation**: LLM groups remaining slices into "Other" category

### 6. Why No New SSE Events?

**Alternative**: Add `chart_generated` event

**Why Reuse Existing Events**:
- **Simplicity**: chartSpec flows naturally through step_complete and message_complete
- **Consistency**: Other artifacts (sqlResult, pythonResult) also flow through metadata
- **Backward compatibility**: Frontend already handles stepResults in metadata
- **Reduced complexity**: No new event handlers needed

---

## Future Enhancements

### Short-Term (Next Quarter)

1. **Multi-Series Charts**
   - Line charts with multiple trend lines
   - Grouped bar charts for comparisons
   - Update prompt to generate multi-series ChartSpecs

2. **Chart Customization UI**
   - Toggle chart type (user switches bar ↔ line)
   - Adjust colors via theme customization
   - Export chart as PNG/SVG

3. **Chart Regeneration**
   - "Regenerate chart as line instead of bar"
   - Update chartType in stepResult and re-render

### Medium-Term (6 Months)

4. **Advanced Chart Types** (requires MUI X Pro license)
   - Heatmaps for correlation matrices
   - Funnel charts for conversion analysis
   - Gauge charts for KPI dashboards

5. **Interactive Drill-Down**
   - Click bar → filter data and regenerate
   - Click pie slice → show detail breakdown

6. **Chart History**
   - Save favorite charts to dashboard
   - Export chart data as CSV

### Long-Term (12+ Months)

7. **Custom Visualizations**
   - User-uploaded D3.js templates
   - Sankey diagrams for flow analysis
   - Network graphs for relationship visualization

8. **Real-Time Charts**
   - Streaming data updates
   - Live refresh on data changes

9. **Collaborative Annotations**
   - Add text annotations to charts
   - Share annotated charts with team

---

## Appendix: Example Interactions

### Example 1: Comparison (Bar Chart)

**User**: "Compare revenue by region for Q4 2025"

**Planner Output**:
```json
{
  "steps": [
    {
      "id": 1,
      "description": "Query revenue by region for Q4 2025 and create bar chart",
      "strategy": "sql_then_python",
      "chartType": "bar",
      "datasets": ["sales"],
      "dependsOn": [],
      "expectedOutput": "Bar chart showing revenue comparison across regions"
    }
  ]
}
```

**Executor SQL Result**:
```csv
region,revenue_millions
North America,45.2
Europe,38.7
Asia Pacific,52.1
Latin America,12.3
Middle East,8.9
```

**Executor ChartSpec Output**:
```json
{
  "type": "bar",
  "title": "Q4 2025 Revenue by Region",
  "xAxisLabel": "Region",
  "yAxisLabel": "Revenue ($M)",
  "categories": ["Asia Pacific", "North America", "Europe", "Latin America", "Middle East"],
  "series": [
    {
      "label": "Revenue ($M)",
      "data": [52.1, 45.2, 38.7, 12.3, 8.9]
    }
  ],
  "layout": "vertical"
}
```

**Frontend Rendering**: Interactive MUI Bar Chart with hover tooltips

---

### Example 2: Trend (Line Chart)

**User**: "Show me monthly sales trend for 2025"

**Planner Output**:
```json
{
  "steps": [
    {
      "id": 1,
      "description": "Query monthly sales for 2025 and create line chart",
      "strategy": "sql_then_python",
      "chartType": "line",
      "datasets": ["orders"],
      "dependsOn": [],
      "expectedOutput": "Line chart showing sales trend over 12 months"
    }
  ]
}
```

**Executor ChartSpec Output**:
```json
{
  "type": "line",
  "title": "2025 Monthly Sales Trend",
  "xAxisLabel": "Month",
  "yAxisLabel": "Sales ($K)",
  "categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  "series": [
    {
      "label": "Sales ($K)",
      "data": [145.2, 152.8, 148.3, 167.9, 171.2, 165.4, 178.6, 182.1, 175.3, 189.7, 195.2, 201.8]
    }
  ]
}
```

**Frontend Rendering**: Interactive MUI Line Chart with data point markers

---

### Example 3: Composition (Pie Chart)

**User**: "What percentage of revenue comes from each product category?"

**Planner Output**:
```json
{
  "steps": [
    {
      "id": 1,
      "description": "Query revenue by product category and create pie chart",
      "strategy": "sql_then_python",
      "chartType": "pie",
      "datasets": ["products", "sales"],
      "dependsOn": [],
      "expectedOutput": "Pie chart showing revenue breakdown by category"
    }
  ]
}
```

**Executor ChartSpec Output**:
```json
{
  "type": "pie",
  "title": "Revenue Breakdown by Product Category",
  "slices": [
    { "label": "Electronics", "value": 452000 },
    { "label": "Clothing", "value": 328000 },
    { "label": "Home & Garden", "value": 215000 },
    { "label": "Sports", "value": 187000 },
    { "label": "Toys", "value": 142000 },
    { "label": "Other", "value": 98000 }
  ]
}
```

**Frontend Rendering**: Interactive MUI Pie Chart with percentage labels on hover

---

### Example 4: No Chart (Single Value)

**User**: "What is the total revenue for 2025?"

**Planner Output**:
```json
{
  "steps": [
    {
      "id": 1,
      "description": "Calculate total revenue for 2025",
      "strategy": "sql",
      "chartType": null,
      "datasets": ["sales"],
      "dependsOn": [],
      "expectedOutput": "Total revenue amount"
    }
  ]
}
```

**Executor Output**: SQL query only, no chartSpec

**Frontend Rendering**: Text narrative only, no chart component

---

**End of Specification**
