import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const emptyForm = {
  name: '',
  amount: '',
  category: '',
  period: 'monthly',
};

const BudgetsPage = () => {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [budgetsRes, categoriesRes] = await Promise.all([
        api.get('/budgets'),
        api.get('/categories'),
      ]);
      setBudgets(budgetsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      toast.error('Unable to load budgets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/budgets', form);
      setForm(emptyForm);
      toast.success('Budget saved');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save budget');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/budgets/${id}`);
      toast.success('Budget removed');
      loadData();
    } catch (error) {
      toast.error('Unable to delete budget');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Budgets</h1>
        </div>
      </div>

      <div className="content-grid">
        <section className="card">
          <h3>Create budget</h3>
          <form onSubmit={handleSubmit} className="form-stack">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Budget name" required />
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
            <input list="budget-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" required />
            <datalist id="budget-categories">
              {categories.map((category) => (
                <option key={category._id} value={category.name} />
              ))}
            </datalist>
            <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
            </select>
            <button type="submit" className="primary-btn">Save budget</button>
          </form>
        </section>

        <section className="card">
          <h3>Active budgets</h3>
          {loading ? <div className="loading-state">Loading budgets…</div> : budgets.length === 0 ? (
            <div className="empty-state">No budgets yet — create one to start planning.</div>
          ) : (
            <ul className="transaction-list">
              {budgets.map((budget) => (
                <li key={budget._id} className="budget-item">
                  <div>
                    <strong>{budget.name}</strong>
                    <p>{budget.category} • {budget.period}</p>
                  </div>
                  <div className="transaction-actions">
                    <span className="positive">${budget.amount}</span>
                    <button type="button" onClick={() => handleDelete(budget._id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default BudgetsPage;
