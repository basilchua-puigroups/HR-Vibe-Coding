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
    label: 'Maintenance Log', path: '/maintenance/log', iconClass: 'module-blue', viewPerm: 'viewMaintLog',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M38 10a14 14 0 0 0-12 20L10 46a4 4 0 0 0 0 6l2 2a4 4 0 0 0 6 0l16-16a14 14 0 0 0 18-16l-8 8-6-2-2-6 8-8A14 14 0 0 0 38 10z" />
      </svg>
    ),
  },
  {
    label: 'Mechanic List', path: '/maintenance/mechanics', iconClass: 'module-teal', viewPerm: 'viewMechanic',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="24" cy="20" r="10" />
        <path d="M8 52c0-9 7-16 16-16s16 7 16 16" />
        <path d="M44 28l4-4 4 4-8 8-4-4z" />
        <path d="M48 24l4-8h4l-4 12" />
        <path d="M44 36l-4 8h-4l4-12" />
      </svg>
    ),
  },
  {
    label: 'PM Schedule', path: '/maintenance/pm-schedule', iconClass: 'module-gold', viewPerm: 'viewPMSchedule',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="10" y="14" width="44" height="40" rx="3" />
        <path d="M10 24h44" />
        <path d="M22 10v8M42 10v8" />
        <path d="M20 34h8M36 34h8M20 42h8M36 42h8" />
      </svg>
    ),
  },
  {
    label: 'Reports', path: '/maintenance/reports', iconClass: 'module-red',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M16 8h32v48H16z" />
        <path d="M24 20h16M24 28h16M24 36h10" />
        <path d="M36 44l6 6 10-12" />
      </svg>
    ),
  },
  {
    label: 'User Settings', path: '/maintenance/settings', iconClass: 'module-orange', settingsPerm: 'manageMaintenanceUsers',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="22" r="10" />
        <path d="M12 52c0-11 9-20 20-20s20 9 20 20" />
        <circle cx="48" cy="44" r="8" />
        <path d="M48 40v4h4" />
      </svg>
    ),
  },
];

export function MaintenanceMenu() {
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
      <div className="module-grid" aria-label="Maintenance modules" style={{ marginTop: 24 }}>
        {visibleModules.map((m) => (
          <button key={m.path} className="module-card" type="button" onClick={() => navigate(m.path)}>
            <span className={`module-icon ${m.iconClass}`}>{m.svg}</span>
            <span className="module-label">{m.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
