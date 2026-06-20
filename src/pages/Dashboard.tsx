import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessHumanResources } from '../utils/permissions';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = !!currentUser?.isAdmin;
  const showHumanResources = canAccessHumanResources(currentUser);

  return (
    <>
      <div className="module-grid" aria-label="Main modules">
        {showHumanResources && (
          <button className="module-card" onClick={() => navigate('/human-resources')} type="button">
            <span className="module-icon module-red">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="24" cy="22" r="8" />
                <circle cx="42" cy="24" r="6" />
                <path d="M10 52c0-10 6-18 14-18s14 8 14 18" />
                <path d="M34 52c1-8 6-14 12-14 5 0 9 5 10 14" />
              </svg>
            </span>
            <span className="module-label">Human Resources</span>
          </button>
        )}

        {isAdmin && (
          <button className="module-card" onClick={() => navigate('/administrator')} type="button">
            <span className="module-icon module-navy">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="22" r="10" />
                <path d="M12 52c0-11 9-20 20-20s20 9 20 20" />
                <circle cx="48" cy="44" r="8" />
                <path d="M48 40v4h4" />
              </svg>
            </span>
            <span className="module-label">Administrator</span>
          </button>
        )}
      </div>
    </>
  );
}
