import zxcvbn from 'zxcvbn';

interface PasswordStrengthBarProps {
  password: string;
}

const COLOR_MAP: Record<number, string> = {
  0: '#dc2626',
  1: '#dc2626',
  2: '#d97706',
  3: '#84cc16',
  4: '#16a34a',
};

const LABEL_MAP: Record<number, string> = {
  0: 'Too weak',
  1: 'Too weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

export default function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  if (!password) return null;

  const { score } = zxcvbn(password);
  const color = COLOR_MAP[score];
  const label = LABEL_MAP[score];
  const widthPercent = (score / 4) * 100;

  return (
    <div style={{ marginTop: '4px' }}>
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#d1d5db',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${widthPercent}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '3px',
            transition: 'width 0.2s ease, background-color 0.2s ease',
          }}
        />
      </div>
      <p style={{ marginTop: '4px', fontSize: '12px', color, margin: '4px 0 0 0' }}>
        {label}
      </p>
    </div>
  );
}
