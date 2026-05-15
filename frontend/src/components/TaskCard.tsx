import { Task } from '../api';

interface Props {
  task: Task;
  householdName?: string;
  onComplete: (id: string) => Promise<void>;
  onEdit: () => void;
  onDelete: (id: string) => Promise<void>;
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatInterval(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours}h`;
  if (hours < 720) return `${(hours / 24).toFixed(hours % 24 === 0 ? 0 : 1)}d`;
  return `${(hours / 720).toFixed(hours % 720 === 0 ? 0 : 1)}mo`;
}

const URGENCY_COLOR: Record<Task['urgency'], string> = {
  overdue: '#dc2626',
  'due-soon': '#d97706',
  'on-track': '#16a34a',
};

export function TaskCard({ task, householdName, onComplete, onEdit, onDelete }: Props) {
  const color = URGENCY_COLOR[task.urgency];
  return (
    <div style={{
      border: `2px solid ${color}`,
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 8,
      fontFamily: 'sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 16 }}>{task.name}</strong>
        <span style={{ color: '#6b7280', fontSize: 13 }}>every {formatInterval(task.intervalHours)}</span>
      </div>
      <div style={{ color: '#4b5563', fontSize: 13, margin: '4px 0 10px' }}>
        Due: {formatDeadline(task.nextDeadline)}
        &nbsp;·&nbsp;{task.householdId ? (householdName ?? 'shared') : 'personal'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onComplete(task.id)}>Mark Done</button>
        <button onClick={onEdit}>Edit</button>
        <button onClick={() => onDelete(task.id)} style={{ color: '#dc2626' }}>Delete</button>
      </div>
    </div>
  );
}
