import { useState, FormEvent } from 'react';
import { api, Task } from '../api';

interface Props {
  task: Task | null;
  onSave: () => Promise<void>;
  onClose: () => void;
}

export function TaskForm({ task, onSave, onClose }: Props) {
  const [name, setName] = useState(task?.name ?? '');
  const [intervalHours, setIntervalHours] = useState(String(task?.intervalHours ?? 24));
  const [shared, setShared] = useState(task ? task.ownerId === null : true);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const hours = parseFloat(intervalHours);
      if (task) {
        await api.updateTask(task.id, { name, intervalHours: hours, shared });
      } else {
        await api.createTask({ name, intervalHours: hours, shared });
      }
      await onSave();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{ background: 'white', borderRadius: 8, padding: 24, minWidth: 340, fontFamily: 'sans-serif' }}>
        <h2 style={{ margin: '0 0 16px' }}>{task ? 'Edit Task' : 'New Task'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Interval (hours)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={intervalHours}
              onChange={e => setIntervalHours(e.target.value)}
              required
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            />
            <small style={{ color: '#6b7280' }}>0.5 = 30 min · 24 = 1 day · 720 = 1 month</small>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>
              <input
                type="checkbox"
                checked={shared}
                onChange={e => setShared(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Shared (visible to all household members)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving…' : task ? 'Save' : 'Create'}
            </button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
