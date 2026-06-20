import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/permissions';

type Mod = {
  label: string;
  path: string;
  iconClass: string;
  svg: React.ReactNode;
  viewPerm?: string;
  settingsPerm?: string;
};

const modules: Mod[] = [
  {
    label: 'Daily Production Report Data Entry', path: '/process/production-entry', iconClass: 'module-teal',
    viewPerm: 'viewProductionEntry',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 12h36v40H14z" /><path d="M22 22h20M22 32h20M22 42h10" /><path d="M44 42l6 6" /></svg>),
  },
  {
    label: 'Daily Production Report', path: '/process/production-report', iconClass: 'module-green',
    viewPerm: 'viewProductionReport',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h32v48H16z" /><path d="M24 20h16M24 28h16M24 36h10" /><path d="M36 44l6 6 10-12" /></svg>),
  },
  {
    label: 'User Settings', path: '/process/settings', iconClass: 'module-navy', settingsPerm: 'manageProcessUsers',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="24" r="10" /><path d="M8 54c0-10 7-18 16-18s16 8 16 18" /><path d="M46 18v12M40 24h12" /></svg>),
  },
];

export function ProcessMenu() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = !!currentUser?.isAdmin;
  const visibleModules = modules.filter((m) => {
    if (m.settingsPerm) return isAdmin || hasPerm(currentUser, m.settingsPerm);
    if (m.viewPerm) return hasPerm(currentUser, m.viewPerm);
    return true;
  });
  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/')}>Back</button>
      </div>
      {visibleModules.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <p>No Process modules yet.</p>
        </div>
      ) : (
        <div className="module-grid" aria-label="Process modules" style={{ marginTop: 24 }}>
          {visibleModules.map((m) => (
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
