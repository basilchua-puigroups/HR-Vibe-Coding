import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NoPermission } from '../../components/NoPermission';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { hasPerm } from '../../utils/permissions';
import type { PieceRateRoles, PieceRateSettings } from '../../types';

const STATIONS: { key: keyof PieceRateSettings; label: string }[] = [
  { key: 'cagesTipped',           label: 'Cages Tipped' },
  { key: 'clarificationStation',  label: 'Clarification Station' },
  { key: 'kernelStation',         label: 'Kernel Station' },
  { key: 'boilerStation',         label: 'Boiler Station' },
  { key: 'waterTreatmentStation', label: 'Water Treatment Station' },
];

const ROLES: { key: keyof PieceRateRoles; label: string }[] = [
  { key: 'stationHead',           label: 'Station Head' },
  { key: 'assistantStationHead',  label: 'Assistant Station Head' },
  { key: 'operator',              label: 'Operator' },
];

const DEFAULT_ROLES: PieceRateRoles = { stationHead: 0, assistantStationHead: 0, operator: 0 };

function RoleInputs({
  values, onChange, disabled,
}: {
  values: PieceRateRoles;
  onChange: (key: keyof PieceRateRoles, val: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {ROLES.map(({ key, label }) => (
        <label key={key} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>RM</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={values[key]}
              disabled={disabled}
              onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
              style={{ width: 120 }}
              className="form-control"
            />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>per cage</span>
          </div>
        </label>
      ))}
    </div>
  );
}

export default function PieceRateSetting() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state, setState } = useApp();

  const [selectedStation, setSelectedStation] = useState<keyof PieceRateSettings>('cagesTipped');
  const [draft, setDraft] = useState<PieceRateSettings>(() => state.pieceRateSettings ?? {
    cagesTipped: { lte4: { ...DEFAULT_ROLES }, gte5: { ...DEFAULT_ROLES } },
    clarificationStation: { ...DEFAULT_ROLES },
    kernelStation:         { ...DEFAULT_ROLES },
    boilerStation:         { ...DEFAULT_ROLES },
    waterTreatmentStation: { ...DEFAULT_ROLES },
  });
  const [saved, setSaved] = useState(false);

  if (!hasPerm(currentUser, 'viewPieceRateSetting')) return <NoPermission backPath="/human-resources" />;

  const canEdit = hasPerm(currentUser, 'editPieceRateSetting');

  function handleSave() {
    setState((prev) => ({ ...prev, pieceRateSettings: draft }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateCagesTipped(tier: 'lte4' | 'gte5', key: keyof PieceRateRoles, val: number) {
    setDraft((d) => ({
      ...d,
      cagesTipped: { ...d.cagesTipped, [tier]: { ...d.cagesTipped[tier], [key]: val } },
    }));
  }

  function updateStation(station: keyof PieceRateSettings, key: keyof PieceRateRoles, val: number) {
    setDraft((d) => ({
      ...d,
      [station]: { ...(d[station] as PieceRateRoles), [key]: val },
    }));
  }

  const stationData = draft[selectedStation];

  return (
    <article className="panel">
      <div className="panel-header">
        <h3>Piece Rate Setting</h3>
        {canEdit && (
          <button className="btn primary" onClick={handleSave}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <button className="btn" onClick={() => navigate('/human-resources')}>Back</button>
      </div>

      <div style={{ display: 'flex', gap: 0, minHeight: 420 }}>
        {/* Station selector */}
        <div style={{
          width: 210, flexShrink: 0, borderRight: '1px solid var(--line)',
          padding: '12px 0',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 16px 8px' }}>
            Station
          </div>
          {STATIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedStation(key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: selectedStation === key ? 'rgba(var(--accent-rgb, 37,99,235), 0.08)' : 'transparent',
                borderLeft: selectedStation === key ? '3px solid var(--accent)' : '3px solid transparent',
                color: selectedStation === key ? 'var(--accent)' : 'var(--text)',
                fontWeight: selectedStation === key ? 600 : 400,
                fontSize: 13,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Settings form */}
        <div style={{ flex: 1, padding: '24px 28px', overflowX: 'auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>
            {STATIONS.find((s) => s.key === selectedStation)?.label}
          </div>

          {selectedStation === 'cagesTipped' ? (
            <div style={{ display: 'grid', gap: 32 }}>
              {/* ≤ 4 cages tier */}
              <div>
                <div style={{
                  display: 'inline-block', marginBottom: 16,
                  background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)',
                  borderRadius: 6, padding: '4px 12px',
                  fontSize: 13, fontWeight: 600, color: '#92400e',
                }}>
                  ≤ 4 Cages per hour
                </div>
                <RoleInputs
                  values={draft.cagesTipped.lte4}
                  onChange={(k, v) => updateCagesTipped('lte4', k, v)}
                  disabled={!canEdit}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--line)' }} />

              {/* ≥ 5 cages tier */}
              <div>
                <div style={{
                  display: 'inline-block', marginBottom: 16,
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)',
                  borderRadius: 6, padding: '4px 12px',
                  fontSize: 13, fontWeight: 600, color: '#166534',
                }}>
                  ≥ 5 Cages per hour
                </div>
                <RoleInputs
                  values={draft.cagesTipped.gte5}
                  onChange={(k, v) => updateCagesTipped('gte5', k, v)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                Standard piece rate — rates will be configured per your requirements.
              </div>
              <RoleInputs
                values={stationData as PieceRateRoles}
                onChange={(k, v) => updateStation(selectedStation, k, v)}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
