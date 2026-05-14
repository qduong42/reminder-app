import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Task } from '../api';
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

export function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.getTasks());
    } catch {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    api.me().catch(() => navigate('/login'));
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
          <button onClick={handleLogout}>Log out</button>
        </div>
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
          onSave={async () => { setShowForm(false); await loadTasks(); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
