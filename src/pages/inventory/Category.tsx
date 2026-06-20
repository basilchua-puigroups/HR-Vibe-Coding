import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import { nextCategoryCode, nextId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import { appendAudit } from '../../utils/audit';
import { NoPermission } from '../../components/NoPermission';
import type { Category } from '../../types';

export default function Category() {
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });

  const canView = hasPerm(currentUser, 'viewCategory');
  const canCreate = hasPerm(currentUser, 'createCategory');
  const canEdit = hasPerm(currentUser, 'editCategory');
  const canDelete = hasPerm(currentUser, 'deleteCategory');

  if (!canView) return <NoPermission backPath="/inventory" />;

  function openAdd() {
    setEditing(null);
    setForm({ code: nextCategoryCode(state), name: '', description: '' });
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ code: c.code, name: c.name, description: c.description });
    setOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Category name is required.'); return; }
    const dupCode = state.categories.some(
      (c) => c.code.trim().toLowerCase() === form.code.trim().toLowerCase() && c.id !== editing?.id
    );
    if (dupCode) { alert(`Code "${form.code.trim()}" is already in use. Please use a different code.`); return; }
    setState((prev) => {
      if (editing) {
        return appendAudit(
          { ...prev, categories: prev.categories.map((c) => c.id === editing.id ? { ...editing, ...form } : c) },
          currentUser, 'Category', 'Edit', { recordRef: form.code, recordId: editing.id, details: form.name },
        );
      }
      const newCat: Category = { id: nextId(prev.categories), ...form };
      return appendAudit(
        { ...prev, categories: [...prev.categories, newCat] },
        currentUser, 'Category', 'Create', { recordRef: newCat.code, recordId: newCat.id, details: newCat.name },
      );
    });
    setOpen(false);
  }

  function handleDelete(id: number) {
    const cat = state.categories.find((c) => c.id === id);
    const used = cat ? state.inventory.filter((i) => i.category === cat.name) : [];
    if (used.length) { alert(`Cannot delete "${cat?.name}" — used by ${used.length} inventory item(s).`); return; }
    if (!confirm('Delete this category?')) return;
    setState((prev) => appendAudit(
      { ...prev, categories: prev.categories.filter((c) => c.id !== id) },
      currentUser, 'Category', 'Delete', { recordRef: cat?.code, recordId: id, details: cat?.name },
    ));
  }

  return (
    <>
      <article className="panel">
        <div className="panel-header">
          <h3>Category</h3>
        </div>
        <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
          <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
          {canCreate && <button className="btn primary" onClick={openAdd}>+ Add Category</button>}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="listing-table">
            <thead>
              <tr><th>No.</th><th>Code</th><th>Category</th><th>Description</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.categories.length === 0 ? (
                <tr><td colSpan={5} className="empty">No categories.</td></tr>
              ) : state.categories.map((c, idx) => (
                <tr key={c.id}>
                  <td>{idx + 1}</td>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.description}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && <button className="btn" style={{ fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => openEdit(c)}>Edit</button>}
                    {canDelete && <button className="btn danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(c.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Category' : 'Add Category'}>
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Code <span style={{ color: 'red' }}>*</span>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required />
          </label>
          <label>
            Category Name <span style={{ color: 'red' }}>*</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label className="full">
            Description
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <button className="btn primary full" type="submit">Save Category</button>
        </form>
      </Modal>
    </>
  );
}
