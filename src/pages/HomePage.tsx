import { Link } from 'react-router-dom';
import { isSupabaseConfigured } from '../lib/supabase';
import { listHostedContests } from '../contest/tokens';
import { useMemo } from 'react';

export function HomePage() {
  const hosted = useMemo(() => listHostedContests(), []);
  const contestReady = isSupabaseConfigured();

  return (
    <div className="setup home">
      <header className="home-hero">
        <p className="eyebrow">Un premio, muchos dibujos</p>
        <h1>Voten el dibujo ganador</h1>
        <p className="lede">
          Sube las obras, comparte un enlace y deja que todos elijan desde el
          teléfono antes de que se acabe el tiempo.
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
          <span className="home-card-mark" aria-hidden="true">
            ✦
          </span>
          <div className="home-kicker">Con enlace público</div>
          <h2>Concurso de dibujos</h2>
          <p>
            Sube los dibujos, elige cómo se vota y comparte. La gente entra con
            su nombre y vota antes de la cuenta atrás.
          </p>
          <span className="home-card-cta">Crear concurso</span>
        </Link>
        <Link to="/bracket" className="home-card">
          <span className="home-card-mark" aria-hidden="true">
            ▣
          </span>
          <div className="home-kicker">En este dispositivo</div>
          <h2>Llave del torneo</h2>
          <p>
            20 participantes, eliminación directa y votación en vivo. Se queda
            en este navegador.
          </p>
          <span className="home-card-cta">Abrir llave</span>
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
