import { useApp } from '../../context/AppContext';

export default function CCR() {
  const { state } = useApp();

  const pendingRfqs = state.rfqs.filter((r) => r.items && r.items.length > 0);

  return (
    <>
      <div className="topbar">
        <div><h2>Comparative Cost Review</h2><p>Compare supplier quotations before ordering.</p></div>
      </div>

      <div className="panel">
        <div className="panel-body">
          {pendingRfqs.length === 0 ? (
            <p className="empty">No RFQs with items available for comparison. Add items to an RFQ first.</p>
          ) : (
            <div className="table-wrap">
              <table className="listing-table">
                <thead>
                  <tr><th>RFQ No.</th><th>Date</th><th>Type</th><th>Suppliers</th><th>Items</th></tr>
                </thead>
                <tbody>
                  {pendingRfqs.map((r) => (
                    <tr key={r.id}>
                      <td>{r.rfqNo}</td>
                      <td>{r.date}</td>
                      <td>{r.type}</td>
                      <td>{r.suppliers.map((s) => s.name).join(', ')}</td>
                      <td>{r.items.length} item(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
