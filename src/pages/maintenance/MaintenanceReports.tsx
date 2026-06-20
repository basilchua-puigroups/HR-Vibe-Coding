import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import type { MaintenanceJob, MaintenanceJobItem } from '../../types';

/** Return a normalised items list whether the job uses the new `items[]` or legacy fields. */
function jobItems(j: MaintenanceJob, lookup: (id: number) => { item: string; unit: string } | undefined): MaintenanceJobItem[] {
  if (j.items?.length) return j.items;
  if (j.itemId) {
    const inv = lookup(j.itemId);
    return [{
      itemId: j.itemId,
      description: inv?.item ?? '',
      quantityUsed: j.quantityUsed ?? 0,
      unit: inv?.unit ?? '',
    }];
  }
  return [];
}

export default function MaintenanceReports() {
  const { state } = useApp();
  const navigate = useNavigate();

  const lookupInv = (id: number) => state.inventory.find((i) => i.id === id);
  const partName  = (id: number) => lookupInv(id)?.item ?? '-';

  const jobs = [...state.maintenance].sort((a, b) => b.date.localeCompare(a.date));

  const totalJobs = jobs.length;
  const totalPartsUsed = jobs.reduce(
    (sum, j) => sum + jobItems(j, lookupInv).reduce((s, it) => s + (Number(it.quantityUsed) || 0), 0),
    0,
  );
  const uniqueEquipment = new Set(jobs.map((j) => j.equipment)).size;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Maintenance Reports</h2>
          <p>Summary of all maintenance jobs and parts consumed.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('/maintenance')}>Back</button>
        </div>
      </div>

      <div className="grid stats" style={{ marginBottom: 24 }}>
        <article className="stat">
          <span>Total Jobs</span>
          <strong>{totalJobs}</strong>
          <small>Maintenance records logged</small>
        </article>
        <article className="stat">
          <span>Parts Consumed</span>
          <strong>{totalPartsUsed}</strong>
          <small>Total quantity used across all jobs</small>
        </article>
        <article className="stat">
          <span>Equipment Serviced</span>
          <strong>{uniqueEquipment}</strong>
          <small>Distinct equipment items</small>
        </article>
      </div>

      <div className="panel">
        <div className="panel-header"><h3>All Maintenance Jobs</h3></div>
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>Job No.</th>
                <th>Date</th>
                <th>Equipment</th>
                <th>Parts Used</th>
                <th>Technician</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={7} className="empty">No maintenance records found.</td></tr>
              ) : jobs.map((j) => {
                const its = jobItems(j, lookupInv);
                return (
                  <tr key={j.id}>
                    <td>{j.jobNo}</td>
                    <td>{j.date}</td>
                    <td>{j.equipment}</td>
                    <td>
                      {its.length === 0
                        ? '-'
                        : its.map((it, idx) => (
                            <div key={idx} style={{ fontSize: 13 }}>
                              {it.description || partName(it.itemId)} × {it.quantityUsed} {it.unit || ''}
                            </div>
                          ))}
                    </td>
                    <td>{j.technician || '-'}</td>
                    <td>{j.status || 'Pending'}</td>
                    <td>{j.remarks || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
