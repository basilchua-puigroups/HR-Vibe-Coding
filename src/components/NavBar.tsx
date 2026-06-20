import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { canAccessHumanResources, hasPerm } from '../utils/permissions';

interface NavBarProps {
  username: string;
  onLogout: () => void;
}

const syncLabel: Record<string, { text: string; color: string }> = {
  idle:    { text: '',            color: '#64748b' },
  loading: { text: 'Loading…',   color: '#64748b' },
  saving:  { text: 'Saving…',    color: '#60a5fa' },
  saved:   { text: 'Synced',     color: '#4ade80' },
  error:   { text: 'Sync error', color: '#f87171' },
  offline: { text: 'Local only', color: '#64748b' },
};

function NavMenu({
  label, to, active, children,
}: { label: string; to: string; active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="nav-menu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <NavLink
        to={to}
        className={`nav-link has-menu${open ? ' open' : ''}${active ? ' active' : ''}`}
        onClick={() => setOpen(false)}
      >
        {label}
      </NavLink>
      <div className={`nav-submenu${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
        {children}
      </div>
    </div>
  );
}

function MobileSection({
  label, children, onClose,
}: { label: string; children: React.ReactNode; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mob-section">
      <button className="mob-section-btn" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mob-section-links" onClick={onClose}>
          {children}
        </div>
      )}
    </div>
  );
}

export function NavBar({ username, onLogout }: NavBarProps) {
  const location = useLocation();
  const { syncStatus, syncError } = useApp();
  const { currentUser } = useAuth();
  const sync = syncLabel[syncStatus];

  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMenu = () => setMobileOpen(false);

  const showHr  = canAccessHumanResources(currentUser);
  const isAdmin = !!currentUser?.isAdmin;

  const canViewPayroll          = hasPerm(currentUser, 'viewPayroll');
  const canViewShiftA           = hasPerm(currentUser, 'viewShiftA');
  const canViewShiftB           = hasPerm(currentUser, 'viewShiftB');
  const canViewWorkerList       = hasPerm(currentUser, 'viewWorkerList');
  const canViewWorkerAttendance = hasPerm(currentUser, 'viewWorkerAttendance');
  const canViewPieceRateSetting = hasPerm(currentUser, 'viewPieceRateSetting');
  const canMgmtHr               = isAdmin || hasPerm(currentUser, 'manageHumanResourcesUsers');

  const hrActive = location.pathname.startsWith('/human-resources');

  const navItem = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';

  const subItem = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';

  const mobSubItem = ({ isActive }: { isActive: boolean }) =>
    `mob-sub-link${isActive ? ' active' : ''}`;

  return (
    <header className="sidebar">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark">MP</div>
        <div>
          <h1>Mill Parts</h1>
          <span>System</span>
        </div>
      </div>

      {/* Desktop Nav */}
      <nav className="nav">
        <NavLink to="/" end className={navItem}>Dashboard</NavLink>

        {showHr && (
          <NavMenu label="Human Resources" to="/human-resources" active={hrActive}>
            {canViewPayroll      && <NavLink to="/human-resources/payroll"             className={subItem}>Payroll</NavLink>}
            {canViewShiftA       && <NavLink to="/human-resources/payroll/shift-a"     className={subItem}>Shift A</NavLink>}
            {canViewShiftB       && <NavLink to="/human-resources/payroll/shift-b"     className={subItem}>Shift B</NavLink>}
            {canViewWorkerList       && <NavLink to="/human-resources/workers"    className={subItem}>Worker List</NavLink>}
            {canViewWorkerAttendance && <NavLink to="/human-resources/attendance" className={subItem}>Attendance Report</NavLink>}
            {canViewPieceRateSetting && <NavLink to="/human-resources/piece-rate" className={subItem}>Piece Rate Setting</NavLink>}
            {canMgmtHr               && <NavLink to="/human-resources/settings"   className={subItem}>User Settings</NavLink>}
          </NavMenu>
        )}

        {isAdmin && <NavLink to="/administrator" className={navItem}>Administrator</NavLink>}
        {isAdmin && <NavLink to="/audit-trail"   className={navItem}>Audit Trail</NavLink>}
      </nav>

      {/* Desktop right */}
      <div className="sidebar-right">
        {sync.text && (
          <div style={{ fontSize: 12, color: sync.color, maxWidth: 240, textAlign: 'right' }}>
            <div title={syncError ?? sync.text}>● {sync.text}</div>
            {syncStatus === 'error' && syncError && (
              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2, wordBreak: 'break-word', lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>
                {syncError}
              </div>
            )}
          </div>
        )}
        <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>{username}</span>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </div>

      {/* Mobile right: sync dot + hamburger */}
      <div className="mob-header-right">
        {sync.text && (
          <span style={{ fontSize: 18, color: sync.color }} title={syncError ?? sync.text}>●</span>
        )}
        <button
          className="hamburger"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen(o => !o)}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile nav panel */}
      {mobileOpen && (
        <div className="mobile-nav-panel">
          <NavLink to="/" end className={mobSubItem} onClick={closeMenu} style={{ paddingLeft: 20 }}>
            Dashboard
          </NavLink>

          {showHr && (
            <MobileSection label="Human Resources" onClose={closeMenu}>
              {canViewPayroll      && <NavLink to="/human-resources/payroll"             className={mobSubItem}>Payroll</NavLink>}
              {canViewShiftA       && <NavLink to="/human-resources/payroll/shift-a"     className={mobSubItem}>Shift A</NavLink>}
              {canViewShiftB       && <NavLink to="/human-resources/payroll/shift-b"     className={mobSubItem}>Shift B</NavLink>}
              {canViewWorkerList       && <NavLink to="/human-resources/workers"    className={mobSubItem}>Worker List</NavLink>}
              {canViewWorkerAttendance && <NavLink to="/human-resources/attendance" className={mobSubItem}>Attendance Report</NavLink>}
              {canViewPieceRateSetting && <NavLink to="/human-resources/piece-rate" className={mobSubItem}>Piece Rate Setting</NavLink>}
              {canMgmtHr               && <NavLink to="/human-resources/settings"   className={mobSubItem}>User Settings</NavLink>}
            </MobileSection>
          )}

          {isAdmin && (
            <NavLink to="/administrator" className={mobSubItem} onClick={closeMenu} style={{ paddingLeft: 20 }}>
              Administrator
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/audit-trail" className={mobSubItem} onClick={closeMenu} style={{ paddingLeft: 20 }}>
              Audit Trail
            </NavLink>
          )}

          <div className="mob-nav-divider" />

          <div className="mob-nav-footer">
            {sync.text && (
              <span style={{ fontSize: 12, color: sync.color }}>● {sync.text}</span>
            )}
            <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>{username}</span>
            <button className="logout-btn" onClick={() => { closeMenu(); onLogout(); }}>Logout</button>
          </div>
        </div>
      )}
    </header>
  );
}
