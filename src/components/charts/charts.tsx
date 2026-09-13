'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Chart palette: navy and royal carry the primary series, gold the highlight,
 * and semantic colours are reserved for pass/fail meaning.
 */
export const CHART_COLORS = {
  navy: '#0f2547',
  royal: '#2559eb',
  gold: '#c8a34a',
  teal: '#0d9488',
  purple: '#7c3aed',
  emerald: '#059669',
  rose: '#e11d48',
  amber: '#d97706',
  slate: '#94a3b8',
} as const;

export const SERIES_COLORS = [
  CHART_COLORS.royal,
  CHART_COLORS.gold,
  CHART_COLORS.teal,
  CHART_COLORS.purple,
  CHART_COLORS.navy,
  CHART_COLORS.amber,
];

const AXIS = { fontSize: 11, fill: '#64748b' } as const;

const tooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 24px rgba(15,37,71,0.12)',
    fontSize: 12,
  },
  labelStyle: { fontWeight: 700, color: '#0f2547', marginBottom: 2 },
} as const;

function ChartFrame({ height, children }: { height: number; children: React.ReactElement }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function EmptyChart({ label = 'Not enough data to chart yet.' }: { label?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[13px] text-slate-500">
      {label}
    </div>
  );
}

/* ------------------------------------------------- progress over exams */

export function ProgressChart({
  data,
  height = 260,
}: {
  data: { label: string; percentage: number; classAverage?: number }[];
  height?: number;
}) {
  if (data.length < 1) return <EmptyChart />;

  const hasAverage = data.some((d) => typeof d.classAverage === 'number');

  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -14 }}>
        <defs>
          <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.royal} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART_COLORS.royal} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={44} unit="%" />
        <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}%`, '']} />
        {hasAverage && <Legend wrapperStyle={{ fontSize: 12 }} />}
        <Area
          type="monotone"
          dataKey="percentage"
          name="Student"
          stroke={CHART_COLORS.royal}
          strokeWidth={2.5}
          fill="url(#progressFill)"
          dot={{ r: 3.5, strokeWidth: 2, fill: '#fff' }}
          activeDot={{ r: 5 }}
        />
        {hasAverage && (
          <Line
            type="monotone"
            dataKey="classAverage"
            name="Class average"
            stroke={CHART_COLORS.gold}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        )}
      </AreaChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------- grade distribution */

export function GradeDistributionChart({
  data,
  height = 260,
}: {
  data: { grade: string; count: number }[];
  height?: number;
}) {
  if (!data.some((d) => d.count > 0)) return <EmptyChart />;

  const gradeColor: Record<string, string> = {
    'A+': CHART_COLORS.emerald,
    A: '#10b981',
    B: CHART_COLORS.royal,
    C: CHART_COLORS.amber,
    D: '#f97316',
    F: CHART_COLORS.rose,
  };

  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="grade" tick={AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value} students`, '']} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((entry) => (
            <Cell key={entry.grade} fill={gradeColor[entry.grade] ?? CHART_COLORS.slate} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/* ---------------------------------------------------------- pass / fail */

export function PassFailChart({
  passed,
  failed,
  absent = 0,
  height = 240,
}: {
  passed: number;
  failed: number;
  absent?: number;
  height?: number;
}) {
  const data = [
    { name: 'Passed', value: passed, fill: CHART_COLORS.emerald },
    { name: 'Failed', value: failed, fill: CHART_COLORS.rose },
    { name: 'Absent', value: absent, fill: CHART_COLORS.slate },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return <EmptyChart />;

  return (
    <ChartFrame height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="52%"
          outerRadius="80%"
          paddingAngle={2}
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------- horizontal comparison */

export function ComparisonBarChart({
  data,
  dataKeys,
  height = 300,
  unit = '%',
  layout = 'horizontal',
}: {
  data: Record<string, string | number>[];
  dataKeys: { key: string; label: string; color?: string }[];
  height?: number;
  unit?: string;
  layout?: 'horizontal' | 'vertical';
}) {
  if (data.length === 0) return <EmptyChart />;

  const vertical = layout === 'vertical';

  return (
    <ChartFrame height={height}>
      <BarChart
        data={data}
        layout={vertical ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, bottom: 4, left: vertical ? 10 : -18 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={!vertical} vertical={vertical} />
        {vertical ? (
          <>
            <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit={unit} />
            <YAxis
              type="category"
              dataKey="name"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              width={128}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} unit={unit} />
          </>
        )}
        <Tooltip {...tooltipStyle} />
        {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {dataKeys.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            fill={series.color ?? SERIES_COLORS[index % SERIES_COLORS.length]}
            radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------ subject profile */

export function SubjectRadarChart({
  data,
  height = 300,
}: {
  data: { subject: string; percentage: number }[];
  height?: number;
}) {
  if (data.length < 3) return <EmptyChart label="At least three subjects are needed for this chart." />;

  return (
    <ChartFrame height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10.5, fill: '#475569' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} angle={90} />
        <Radar
          name="Percentage"
          dataKey="percentage"
          stroke={CHART_COLORS.royal}
          fill={CHART_COLORS.royal}
          fillOpacity={0.28}
          strokeWidth={2}
        />
        <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}%`, '']} />
      </RadarChart>
    </ChartFrame>
  );
}
