import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const emptyForm = {
  name: '',
  type: 'expense',
};

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  const loadCategories = async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data);
    } catch (error) {
      toast.error('Unable to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/categories', form);
      setForm(emptyForm);
      toast.success('Category created');
      loadCategories();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to create category');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Organization</p>
          <h1>Categories</h1>
        </div>
      </div>

      <div className="content-grid">
        <section className="card">
          <h3>Add category</h3>
          <form onSubmit={handleSubmit} className="form-stack">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Category name" required />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button type="submit" className="primary-btn">Save category</button>
          </form>
        </section>

        <section className="card">
          <h3>Saved categories</h3>
          {loading ? <div className="loading-state">Loading categories…</div> : categories.length === 0 ? (
            <div className="empty-state">No categories yet — add your first one above.</div>
          ) : (
            <ul className="transaction-list">
              {categories.map((category) => (
                <li key={category._id}>
                  <div>
                    <strong>{category.name}</strong>
                    <p>{category.type}</p>
                  </div>
                  <span className={category.type === 'income' ? 'positive' : 'negative'}>{category.type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default CategoriesPage;
