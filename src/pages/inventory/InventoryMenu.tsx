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
    label: 'Item File', path: '/inventory/items', iconClass: 'module-teal', viewPerm: 'viewItem',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 20h40v32H12z" /><path d="M12 28h40M12 36h40M24 20v32M40 20v32" /></svg>),
  },
  {
    label: 'Receive In', path: '/inventory/receive-in', iconClass: 'module-red', viewPerm: 'viewReceive',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 32h40M40 20l12 12-12 12M24 20L12 32l12 12" /></svg>),
  },
  {
    label: 'Issue Out Form', path: '/inventory/issue-out', iconClass: 'module-gold', viewPerm: 'viewIssueOut',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 32h36M32 20l12 12-12 12" /><path d="M44 12h12v40H44" /></svg>),
  },
  {
    label: 'Transaction', path: '/inventory/transactions/log', iconClass: 'module-red', viewPerm: 'viewTransaction',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 32h40M40 20l12 12-12 12M24 20L12 32l12 12" /></svg>),
  },
  {
    label: 'Category', path: '/inventory/category', iconClass: 'module-navy', viewPerm: 'viewCategory',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 12h16v16H12zM36 12h16v16H36zM12 36h16v16H12zM36 36h16v16H36z" /></svg>),
  },
  {
    label: 'Station', path: '/inventory/station', iconClass: 'module-teal', viewPerm: 'viewStation',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="28" width="44" height="24" rx="2" /><path d="M20 28v-8a12 12 0 0 1 24 0v8" /><circle cx="32" cy="40" r="4" /></svg>),
  },
  {
    label: 'Store Location', path: '/inventory/location', iconClass: 'module-blue', viewPerm: 'viewLocation',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8c-8 0-14 6-14 14 0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14z" /><circle cx="32" cy="22" r="5" /></svg>),
  },
  {
    label: 'Fixed Asset', path: '/inventory/fixed-asset', iconClass: 'module-navy', viewPerm: 'viewFixedAsset',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="20" width="48" height="32" rx="3" /><path d="M20 20v-6a12 12 0 0 1 24 0v6" /><path d="M26 36h12M32 30v12" /></svg>),
  },
  {
    label: 'Diesel', path: '/inventory/diesel', iconClass: 'module-gold', viewPerm: 'viewDiesel',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 10h22v44H20z" /><path d="M26 10V6h10v4M28 22h6M42 20h8v20c0 4 6 4 6 0V28" /><path d="M50 20l4 4" /></svg>),
  },
  {
    label: 'Reports', path: '/inventory/reports', iconClass: 'module-red', viewPerm: 'viewInventoryReports',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h32v48H16z" /><path d="M24 20h16M24 28h16M24 36h10" /><path d="M36 44l6 6 10-12" /></svg>),
  },
  {
    label: 'User Settings', path: '/inventory/settings', iconClass: 'module-orange', settingsPerm: 'manageInventoryUsers',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="22" r="10" /><path d="M12 52c0-11 9-20 20-20s20 9 20 20" /><circle cx="48" cy="44" r="8" /><path d="M48 40v4h4" /></svg>),
  },
];

export function InventoryMenu() {
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
      <div className="module-grid" aria-label="Inventory modules" style={{ marginTop: 24 }}>
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
