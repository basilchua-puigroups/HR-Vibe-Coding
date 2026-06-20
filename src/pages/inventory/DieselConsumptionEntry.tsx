import { useNavigate } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/permissions';

export default function DieselConsumptionEntry() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  if (!hasPerm(currentUser, 'viewDieselConsumptionEntry')) return <NoPermission backPath="/inventory/diesel" />;

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Diesel Consumption Entry</h3>
      </div>
      <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
        <button className="btn" onClick={() => navigate('/inventory/diesel')}>Back</button>
      </div>
      <div className="panel-body">
        <p className="empty">No diesel consumption entry form yet.</p>
      </div>
    </article>
  );
}
