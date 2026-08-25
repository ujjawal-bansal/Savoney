import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const emptyForm = {
  title: '',
  amount: '',
  type: 'expense',
  category: '',
  date: '',
  notes: '',
};

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  const loadTransactions = async () => {
    try {
      const { data } = await api.get('/transactions');
      setTransactions(data);
    } catch (error) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/transactions', form);
      setForm(emptyForm);
      toast.success('Transaction saved');
      loadTransactions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save transaction');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/transactions/${id}`);
      toast.success('Transaction removed');
      loadTransactions();
    } catch (error) {
      toast.error('Unable to delete transaction');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Records</p>
          <h1>Transactions</h1>
        </div>
      </div>

      <div className="content-grid">
        <section className="card">
          <h3>Add transaction</h3>
          <form onSubmit={handleSubmit} className="form-stack">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required />
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" required />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" required />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows="3" />
            <button type="submit" className="primary-btn">Save transaction</button>
          </form>
        </section>

        <section className="card">
          <h3>Transaction history</h3>
          {loading ? <div className="loading-state">Loading transactions…</div> : transactions.length === 0 ? (
            <div className="empty-state">No transactions yet — add your first one above.</div>
          ) : (
            <ul className="transaction-list">
              {transactions.map((item) => (
                <li key={item._id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.category} • {item.date}</p>
                  </div>
                  <div className="transaction-actions">
                    <span className={item.type === 'income' ? 'positive' : 'negative'}>${item.amount}</span>
                    <button type="button" onClick={() => handleDelete(item._id)}>Delete</button>
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

export default TransactionsPage;
