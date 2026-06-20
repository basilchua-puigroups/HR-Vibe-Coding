import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/permissions';

type Mod = { label: string; path: string; iconClass: string; svg: React.ReactNode; viewPerm?: string };

const modules: Mod[] = [
  {
    label: 'Piece Rate Setting',
    path: '/human-resources/job-list/piece-rate',
    iconClass: 'module-green',
    viewPerm: 'viewPieceRateSetting',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="12" y="14" width="40" height="36" rx="4" />
        <path d="M20 26h8M20 34h8M20 42h8" />
        <path d="M34 26h10M34 34h10M34 42h6" />
      </svg>
    ),
  },
];

export default function JobList() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const visible = modules.filter((m) => !m.viewPerm || hasPerm(currentUser, m.viewPerm));

  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
      </div>
      {visible.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <p>No Job List modules available.</p>
        </div>
      ) : (
        <div className="module-grid" aria-label="Job List modules" style={{ marginTop: 24 }}>
          {visible.map((m) => (
            <button key={m.path} className="module-card" type="button" onClick={() => navigate(m.path)}>
              <span className={`module-icon ${m.iconClass}`}>{m.svg}</span>
              <span className="module-label">{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
