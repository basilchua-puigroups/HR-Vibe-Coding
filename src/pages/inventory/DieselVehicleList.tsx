import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { NoPermission } from '../../components/NoPermission';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { nextId } from '../../utils/codes';
import { hasPerm } from '../../utils/permissions';
import type { DieselEquipment, FixedAsset } from '../../types';

export default function DieselVehicleList() {
  const navigate = useNavigate();
  const { state, setState } = useApp();
  const { currentUser } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [pickedIds, setPickedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');

  if (!hasPerm(currentUser, 'viewDieselVehicleList')) return <NoPermission backPath="/inventory/diesel" />;

  const canImport = hasPerm(currentUser, 'createDieselVehicle');
  const importedAssetIds = new Set((state.dieselEquipment ?? []).map((item) => item.fixedAssetId).filter(Boolean));
  const importableAssets = state.fixedAssets.filter((asset) => !importedAssetIds.has(asset.id));
  const filteredEquipment = (state.dieselEquipment ?? []).filter((item) => {
    const text = `${item.assetNo} ${item.name} ${item.category} ${item.station} ${item.equipment} ${item.type} ${item.status} ${item.remarks}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const pickedAssets = useMemo(
    () => importableAssets.filter((asset) => pickedIds.includes(asset.id)),
    [importableAssets, pickedIds],
  );

  function togglePicked(id: number, checked: boolean) {
    setPickedIds((prev) => checked ? [...prev, id] : prev.filter((x) => x !== id));
  }

  function equipmentFromAsset(asset: FixedAsset, id: number): DieselEquipment {
    return {
      id,
      fixedAssetId: asset.id,
      assetNo: asset.assetNo,
      name: asset.name,
      category: asset.category,
      station: asset.station ?? asset.location ?? '',
      equipment: asset.equipment ?? '',
      type: asset.category || asset.equipment || 'Equipment',
      status: asset.status || 'Active',
      remarks: asset.remarks,
    };
  }

  function importPicked() {
    if (pickedAssets.length === 0) return;
    setState((prev) => {
      let id = nextId(prev.dieselEquipment ?? []);
      const rows = pickedAssets.map((asset) => equipmentFromAsset(asset, id++));
      return { ...prev, dieselEquipment: [...rows, ...(prev.dieselEquipment ?? [])] };
    });
    setPickedIds([]);
    setImportOpen(false);
  }

  return (
    <>
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import From Fixed Asset" wide>
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th></th>
                <th>Asset No.</th>
                <th>Name</th>
                <th>Category</th>
                <th>Station</th>
                <th>Equipment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {importableAssets.length === 0 ? (
                <tr><td colSpan={7} className="empty">No fixed assets available to import.</td></tr>
              ) : importableAssets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={pickedIds.includes(asset.id)}
                      onChange={(e) => togglePicked(asset.id, e.target.checked)}
                    />
                  </td>
                  <td>{asset.assetNo}</td>
                  <td>{asset.name}</td>
                  <td>{asset.category || '-'}</td>
                  <td>{(asset.station ?? asset.location) || '-'}</td>
                  <td>{asset.equipment || '-'}</td>
                  <td>{asset.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn" type="button" onClick={() => setImportOpen(false)}>Cancel</button>
          <button className="btn primary" type="button" onClick={importPicked} disabled={pickedIds.length === 0}>Import</button>
        </div>
      </Modal>

      <article className="panel">
        <div className="panel-header">
          <h3>Equipment List</h3>
        </div>
        <div className="listing-actions" style={{ padding: '12px 16px 0' }}>
          <button className="btn" onClick={() => navigate('/inventory/diesel')}>Back</button>
          {canImport && <button className="btn primary" onClick={() => setImportOpen(true)}>Import From Fixed Asset</button>}
        </div>
        <div className="listing-controls" style={{ padding: '12px 16px 0' }}>
          <label className="search-control">
            Search:&nbsp;
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table className="listing-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Asset No.</th>
                <th>Equipment Name</th>
                <th>Category / Type</th>
                <th>Station</th>
                <th>Equipment</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipment.length === 0 ? (
                <tr><td colSpan={8} className="empty">No diesel equipment yet. Import from Fixed Asset to begin.</td></tr>
              ) : filteredEquipment.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>{item.assetNo || '-'}</td>
                  <td>{item.name}</td>
                  <td>{item.type || item.category || '-'}</td>
                  <td>{item.station || '-'}</td>
                  <td>{item.equipment || '-'}</td>
                  <td>{item.status || '-'}</td>
                  <td>{item.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
