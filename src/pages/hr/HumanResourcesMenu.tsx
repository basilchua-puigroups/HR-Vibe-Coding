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
    label: 'Payroll', path: '/human-resources/payroll', iconClass: 'module-gold', viewPerm: 'viewPayroll',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 18h40v30H12z" /><path d="M20 28h14M20 38h24" /><circle cx="44" cy="28" r="4" /></svg>),
  },
  {
    label: 'Worker List', path: '/human-resources/workers', iconClass: 'module-red', viewPerm: 'viewWorkerList',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="22" r="8" /><circle cx="42" cy="24" r="6" /><path d="M10 52c0-10 6-18 14-18s14 8 14 18" /><path d="M34 52c1-8 6-14 12-14 5 0 9 5 10 14" /></svg>),
  },
  {
    label: 'Attendance Report', path: '/human-resources/attendance', iconClass: 'module-blue', viewPerm: 'viewWorkerAttendance',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="14" width="44" height="36" rx="3" /><path d="M10 24h44" /><path d="M22 14v6M42 14v6" /><path d="M18 34h8v8h-8z" /><path d="M30 34h16M30 42h10" /></svg>),
  },
  {
    label: 'Job List', path: '/human-resources/job-list', iconClass: 'module-green', viewPerm: 'viewJobList',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="14" width="40" height="36" rx="4" /><path d="M20 26h8M20 34h8M20 42h8" /><path d="M34 26h10M34 34h10M34 42h6" /></svg>),
  },
  {
    label: 'User Settings', path: '/human-resources/settings', iconClass: 'module-navy', settingsPerm: 'manageHumanResourcesUsers',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="24" r="10" /><path d="M8 54c0-10 7-18 16-18s16 8 16 18" /><path d="M46 18v12M40 24h12" /></svg>),
  },
];

export function HumanResourcesMenu() {
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
          <p>No Human Resources modules yet.</p>
        </div>
      ) : (
        <div className="module-grid" aria-label="Human Resources modules" style={{ marginTop: 24 }}>
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
