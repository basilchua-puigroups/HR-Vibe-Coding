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
    label: 'Item Request Form', path: '/procurement/requests', iconClass: 'module-green', viewPerm: 'viewIrf',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h28l8 8v40H16z" /><path d="M44 8v10h10" /><path d="M24 22h16M24 31h16M24 40h9" /><path d="M43 42l8-8 5 5-8 8-7 2z" /></svg>),
  },
  {
    label: 'Request For Quotation', path: '/procurement/rfqs', iconClass: 'module-gold', viewPerm: 'viewRfq',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 18h24v32H20z" /><path d="M14 24h24v32H14zM26 12h24v32" /><path d="M20 32h13M20 40h13M20 48h9" /></svg>),
  },
  {
    label: 'Purchase Order', path: '/procurement/orders', iconClass: 'module-blue', viewPerm: 'viewPo',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10h24l8 8v36H18z" /><path d="M42 10v10h10" /><path d="M25 29h16M25 36h16M25 43h10" /></svg>),
  },
  {
    label: 'Supplier', path: '/procurement/suppliers', iconClass: 'module-navy', viewPerm: 'viewSupplier',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M23 30a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM41 30a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM32 34a10 10 0 0 0-10 10v6h20v-6a10 10 0 0 0-10-10z" /></svg>),
  },
  {
    label: 'Reports', path: '/procurement/reports', iconClass: 'module-teal',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h32v48H16z" /><path d="M24 20h16M24 28h16M24 36h10" /><path d="M36 44l6 6 10-12" /></svg>),
  },
  {
    label: 'User Settings', path: '/procurement/settings', iconClass: 'module-orange', settingsPerm: 'manageProcurementUsers',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="22" r="10" /><path d="M12 52c0-11 9-20 20-20s20 9 20 20" /><circle cx="48" cy="44" r="8" /><path d="M48 40v4h4" /></svg>),
  },
];

export function ProcurementMenu() {
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
      <div className="module-grid" aria-label="Procurement modules" style={{ marginTop: 24 }}>
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
