import { useEffect, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import api from '../services/api';

const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const AnalyticsPage = () => {
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0, byCategory: [] });

  useEffect(() => {
    const loadSummary = async () => {
      const { data } = await api.get('/analytics/summary');
      setSummary(data);
    };

    loadSummary();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Insights</p>
          <h1>Analytics</h1>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card income">
          <p>Income</p>
          <h2>${summary.income.toFixed(2)}</h2>
        </div>
        <div className="stat-card expense">
          <p>Expense</p>
          <h2>${summary.expense.toFixed(2)}</h2>
        </div>
        <div className="stat-card balance">
          <p>Net</p>
          <h2>${summary.balance.toFixed(2)}</h2>
        </div>
      </div>

      <div className="card analytics-card">
        <h3>Spending by category</h3>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={summary.byCategory} dataKey="amount" nameKey="name" outerRadius={110}>
              {summary.byCategory.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AnalyticsPage;
