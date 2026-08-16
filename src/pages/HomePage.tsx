import { Link } from 'react-router-dom';
import { isSupabaseConfigured } from '../lib/supabase';
import { listHostedContests } from '../contest/tokens';
import { useMemo } from 'react';

export function HomePage() {
  const hosted = useMemo(() => listHostedContests(), []);
  const contestReady = isSupabaseConfigured();

  return (
    <div className="setup home">
      <header className="setup-header">
        <h1>Concursos</h1>
        <p className="subtitle">
          Organiza un concurso de dibujos con un enlace público para votar, o
          una llave en vivo en este dispositivo.
        </p>
      </header>

      <div className="home-choices">
        <Link
          to="/contest/new"
          className={`home-card featured${contestReady ? '' : ' disabled'}`}
          onClick={(event) => {
            if (!contestReady) event.preventDefault();
          }}
          aria-disabled={!contestReady}
        >
          <div className="home-kicker">Ideal para un premio</div>
          <h2>Concurso de dibujos</h2>
          <p>
            Sube los dibujos, nombra la sesión, elige un sistema de votación y
            comparte un enlace. La gente entra con su nombre y vota antes de
            que termine la cuenta atrás.
          </p>
        </Link>
        <Link to="/bracket" className="home-card">
          <div className="home-kicker">En este dispositivo</div>
          <h2>Llave del torneo</h2>
          <p>
            20 participantes, eliminación directa, votación controlada por
            quien presenta. Se queda en este navegador.
          </p>
        </Link>
      </div>

      {!contestReady && (
        <p className="error">
          Los concursos de dibujos necesitan las claves de Supabase en un
          archivo <code>.env.local</code>.
        </p>
      )}

      {hosted.length > 0 && (
        <section className="home-recent">
          <h2>Tus concursos</h2>
          <ul className="participant-list">
            {hosted.map((item) => (
              <li key={item.slug}>
                <span className="thumb placeholder" aria-hidden="true">
                  {item.name.slice(0, 1).toUpperCase()}
                </span>
                <Link to={`/contest/${item.slug}`} className="home-recent-link">
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
