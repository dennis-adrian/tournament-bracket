import { Link, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link to="/" className="brand">
          Concursos
        </Link>
      </header>
      <Outlet />
    </div>
  );
}
