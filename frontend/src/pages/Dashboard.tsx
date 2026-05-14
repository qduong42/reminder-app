import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Task, Household } from '../api';
import { TaskCard } from '../components/TaskCard';
import { TaskForm } from '../components/TaskForm';

type UrgencyKey = 'overdue' | 'due-soon' | 'on-track';

const SECTION_LABEL: Record<UrgencyKey, string> = {
  overdue: 'Overdue',
  'due-soon': 'Due Soon',
  'on-track': 'On Track',
};

const SECTION_COLOR: Record<UrgencyKey, string> = {
  overdue: '#dc2626',
  'due-soon': '#d97706',
  'on-track': '#16a34a',
};

type Scope = 'all' | 'personal' | string;

export function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [households, setHouseholds] = useState<Household[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      if (scope === 'all') {
        setTasks(await api.getTasks());
      } else if (scope === 'personal') {
        setTasks(await api.getTasks({ scope: 'personal' }));
      } else {
        setTasks(await api.getTasks({ householdId: scope }));
      }
    } catch {
      navigate('/login');
    }
  }, [navigate, scope]);

  useEffect(() => {
    api.me().catch(() => navigate('/login'));
    api.getHouseholds()
      .then(data => setHouseholds(data.filter(h => h.status === 'active')))
      .catch(() => {});
    loadTasks();
  }, [loadTasks, navigate]);

  async function handleComplete(id: string) {
    const updated = await api.completeTask(id);
    setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
  }

  async function handleDelete(id: string) {
    await api.deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function handleLogout() {
    await api.logout();
    navigate('/login');
  }

  const groups: Record<UrgencyKey, Task[]> = {
    overdue: tasks.filter(t => t.urgency === 'overdue'),
    'due-soon': tasks.filter(t => t.urgency === 'due-soon'),
    'on-track': tasks.filter(t => t.urgency === 'on-track'),
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Tasks</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setEditTask(null); setShowForm(true); }}>+ New Task</button>
          <button onClick={() => navigate('/households')}>Households</button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'personal'] as Scope[]).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{ fontWeight: scope === s ? 'bold' : 'normal', textDecoration: scope === s ? 'underline' : 'none' }}
          >
            {s === 'all' ? 'All Tasks' : 'Personal'}
          </button>
        ))}
        {households.map(h => (
          <button
            key={h.id}
            onClick={() => setScope(h.id)}
            style={{ fontWeight: scope === h.id ? 'bold' : 'normal', textDecoration: scope === h.id ? 'underline' : 'none' }}
          >
            {h.name}
          </button>
        ))}
      </div>

      {tasks.length === 0 && (
        <p style={{ color: '#6b7280' }}>No tasks yet. Create one to get started.</p>
      )}

      {(['overdue', 'due-soon', 'on-track'] as UrgencyKey[]).map(group =>
        groups[group].length > 0 ? (
          <section key={group} style={{ marginBottom: 24 }}>
            <h2 style={{ color: SECTION_COLOR[group], margin: '0 0 8px', fontSize: 18 }}>
              {SECTION_LABEL[group]} ({groups[group].length})
            </h2>
            {groups[group].map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onEdit={() => { setEditTask(task); setShowForm(true); }}
                onDelete={handleDelete}
              />
            ))}
          </section>
        ) : null,
      )}

      {showForm && (
        <TaskForm
          task={editTask}
          households={households}
          defaultHouseholdId={scope !== 'all' && scope !== 'personal' ? scope : undefined}
          onSave={async () => { setShowForm(false); await loadTasks(); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
