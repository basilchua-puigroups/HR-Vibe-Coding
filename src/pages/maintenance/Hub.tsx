import { useNavigate } from 'react-router-dom';

const modules = [
  { label: 'Issue Out', path: '/maintenance/issue-out', icon: 'module-orange', abbr: 'IO' },
  { label: 'CCR', path: '/maintenance/ccr', icon: 'module-red', abbr: 'CC' },
];

export function MaintenanceHub() {
  const navigate = useNavigate();
  return (
    <>
      <div className="topbar">
        <div><h2>Maintenance</h2><p>Issue out parts and manage maintenance records.</p></div>
      </div>
      <div className="panel">
        <div className="module-grid">
          {modules.map(({ label, path, icon, abbr }) => (
            <button key={path} className="module-card" onClick={() => navigate(path)}>
              <div className={`module-icon ${icon}`} style={{ fontSize: 18, fontWeight: 800 }}>{abbr}</div>
              <span className="module-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
