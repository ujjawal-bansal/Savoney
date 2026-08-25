import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const DashboardPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [transactionsRes, analyticsRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/analytics/summary'),
      ]);
      setTransactions(transactionsRes.data);
      setSummary(analyticsRes.data);
    } catch (error) {
      toast.error('Unable to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  if (loading) {
    return <div className="page"><div className="loading-state">Loading dashboard…</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
        </div>
        <Link to="/transactions" className="primary-btn">Manage transactions</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card income">
          <p>Total income</p>
          <h2>${summary.income.toFixed(2)}</h2>
        </div>
        <div className="stat-card expense">
          <p>Total expense</p>
          <h2>${summary.expense.toFixed(2)}</h2>
        </div>
        <div className="stat-card balance">
          <p>Balance</p>
          <h2>${summary.balance.toFixed(2)}</h2>
        </div>
      </div>

      <div className="content-grid">
        <section className="card">
          <h3>Category spending</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary.byCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h3>Recent transactions</h3>
          {recentTransactions.length === 0 ? (
            <div className="empty-state">No transactions yet — add your first one to get started.</div>
          ) : (
            <ul className="transaction-list">
              {recentTransactions.map((item) => (
                <li key={item._id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.category}</p>
                  </div>
                  <span className={item.type === 'income' ? 'positive' : 'negative'}>
                    {item.type === 'income' ? '+' : '-'}${item.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
