import { useNavigate } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/permissions';

type Mod = {
  label: string;
  path: string;
  iconClass: string;
  svg: React.ReactNode;
  viewPerm: string;
};

const modules: Mod[] = [
  {
    label: 'Diesel Consumption Entry',
    path: '/inventory/diesel/consumption-entry',
    iconClass: 'module-gold',
    viewPerm: 'viewDieselConsumptionEntry',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10h24v44H18z" /><path d="M26 22h8M42 20h8v20c0 4 6 4 6 0V28" /><path d="M50 20l4 4" /></svg>),
  },
  {
    label: 'Equipment List',
    path: '/inventory/diesel/vehicles',
    iconClass: 'module-orange',
    viewPerm: 'viewDieselVehicleList',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 40h44l-5-14H20z" /><circle cx="20" cy="46" r="5" /><circle cx="46" cy="46" r="5" /><path d="M24 26V16h16v10" /></svg>),
  },
  {
    label: 'Diesel Consumption Record',
    path: '/inventory/diesel/consumption-record',
    iconClass: 'module-red',
    viewPerm: 'viewDieselConsumptionRecord',
    svg: (<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h32v48H16z" /><path d="M24 20h16M24 30h16M24 40h10" /></svg>),
  },
];

export default function Diesel() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  if (!hasPerm(currentUser, 'viewDiesel')) return <NoPermission backPath="/inventory" />;

  const visibleModules = modules.filter((m) => hasPerm(currentUser, m.viewPerm));

  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/inventory')}>Back</button>
      </div>
      {visibleModules.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <p>No Diesel modules available.</p>
        </div>
      ) : (
        <div className="module-grid" aria-label="Diesel modules" style={{ marginTop: 24 }}>
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
