import { useState, FormEvent } from 'react';
import { api, Task } from '../api';
import { parseInterval } from '../utils/parseInterval';

interface Props {
  task: Task | null;
  onSave: () => Promise<void>;
  onClose: () => void;
}

function formatIntervalForInput(hours: number): string {
  if (hours % 720 === 0) return `${hours / 720}m`;
  if (hours % 24 === 0) return `${hours / 24}d`;
  return `${hours}h`;
}

export function TaskForm({ task, onSave, onClose }: Props) {
  const [name, setName] = useState(task?.name ?? '');
  const [intervalInput, setIntervalInput] = useState(task ? formatIntervalForInput(task.intervalHours) : '24h');
  const [loading, setLoading] = useState(false);
  const [intervalError, setIntervalError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseInterval(intervalInput);
    if (!parsed.ok) {
      setIntervalError(parsed.error);
      return;
    }
    setIntervalError('');
    setLoading(true);
    try {
      if (task) {
        await api.updateTask(task.id, { name, intervalHours: parsed.hours });
      } else {
        await api.createTask({ name, intervalHours: parsed.hours });
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
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Interval</label>
            <input
              type="text"
              value={intervalInput}
              onChange={e => { setIntervalInput(e.target.value); setIntervalError(''); }}
              placeholder="e.g. 2h, 3d, 1m"
              required
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            />
            {intervalError && <small style={{ color: '#dc2626' }}>{intervalError}</small>}
            <small style={{ color: '#6b7280', display: 'block', marginTop: 2 }}>h = hours · d = days · m = months</small>
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
