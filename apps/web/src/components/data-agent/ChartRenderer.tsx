import { Paper, Typography, useTheme } from '@mui/material';
import { BarChart, LineChart, PieChart, ScatterChart } from '@mui/x-charts';
import type { ChartSpec } from '../../types';

interface ChartRendererProps {
  chartSpec: ChartSpec;
}

export function ChartRenderer({ chartSpec }: ChartRendererProps) {
  const theme = useTheme();
  const chartHeight = 350;

  const containerSx = {
    p: 2,
    my: 2,
    bgcolor: theme.palette.background.paper,
    borderRadius: 1,
  };

  const titleSx = {
    fontWeight: 600,
    color: theme.palette.text.primary,
    mb: 1,
  };

  switch (chartSpec.type) {
    case 'bar': {
      const isHorizontal = chartSpec.layout === 'horizontal';
      const bandAxisConfig = {
        data: chartSpec.categories || [],
        scaleType: 'band' as const,
        label: isHorizontal ? chartSpec.yAxisLabel : chartSpec.xAxisLabel,
      };
      const valueAxisConfig = {
        label: isHorizontal ? chartSpec.xAxisLabel : chartSpec.yAxisLabel,
      };
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
            xAxis={[isHorizontal ? valueAxisConfig : bandAxisConfig]}
            yAxis={[isHorizontal ? bandAxisConfig : valueAxisConfig]}
            layout={chartSpec.layout}
            slotProps={{
              legend: {
                direction: 'horizontal',
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
                direction: 'horizontal',
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
                highlightScope: { fade: 'global', highlight: 'item' },
                faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
              },
            ]}
            slotProps={{
              legend: {
                direction: 'vertical',
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
