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
    label: 'Shift A',
    path: '/human-resources/payroll/shift-a',
    iconClass: 'module-teal',
    viewPerm: 'viewShiftA',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="18" />
        <path d="M32 14v18l10 6" />
        <text x="32" y="56" textAnchor="middle" fontSize="10" fontWeight="bold">A</text>
      </svg>
    ),
  },
  {
    label: 'Shift B',
    path: '/human-resources/payroll/shift-b',
    iconClass: 'module-blue',
    viewPerm: 'viewShiftB',
    svg: (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="18" />
        <path d="M32 14v18l10 6" />
        <text x="32" y="56" textAnchor="middle" fontSize="10" fontWeight="bold">B</text>
      </svg>
    ),
  },
];

export default function Payroll() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  if (!hasPerm(currentUser, 'viewPayroll')) return <NoPermission backPath="/human-resources" />;

  const visibleModules = modules.filter((m) => hasPerm(currentUser, m.viewPerm));

  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
      </div>
      {visibleModules.length === 0 ? (
        <div className="panel" style={{ marginTop: 24, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <p>No Payroll modules available.</p>
        </div>
      ) : (
        <div className="module-grid" aria-label="Payroll modules" style={{ marginTop: 24 }}>
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
