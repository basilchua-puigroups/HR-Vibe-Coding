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
    label: 'Cages Tipped',
    path: '/human-resources/payroll/shift-b/cages-tipped',
    iconClass: 'module-teal',
    viewPerm: 'viewCagesTipped',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="10" y="20" width="44" height="28" rx="3" />
        <path d="M10 30h44M22 20v28M42 20v28" />
        <path d="M16 12l4 8M32 10v10M48 12l-4 8" />
      </svg>
    ),
  },
];

export default function ShiftB() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  if (!hasPerm(currentUser, 'viewShiftB')) return <NoPermission backPath="/human-resources/payroll" />;

  const visibleModules = modules.filter((m) => hasPerm(currentUser, m.viewPerm));

  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/human-resources/payroll')}>Back</button>
      </div>
      {visibleModules.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <p>No Shift B modules available.</p>
        </div>
      ) : (
        <div className="module-grid" aria-label="Shift B modules" style={{ marginTop: 24 }}>
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
