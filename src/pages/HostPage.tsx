import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { closeContest, publicImageUrl, startContest } from '../contest/api';
import { getHostToken } from '../contest/tokens';
import { useContest } from '../contest/useContest';
import { VOTING_SYSTEMS, activeEntries, contestRound, isRunoffRound } from '../contest/types';
import { Countdown } from '../components/Countdown';
import { ContestResults } from '../components/ContestResults';
import { LightboxImage } from '../components/LightboxImage';

export function HostPage() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useContest(slug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);

  if (!slug) return <Navigate to="/" replace />;
  if (loading && !data) return <p className="setup">Cargando concurso…</p>;
  if (error && !data) {
    return (
      <div className="setup">
        <p className="crumb">
          <Link to="/">Inicio</Link>
        </p>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  if (!data.is_host) {
    return <Navigate to={`/vote/${slug}`} replace />;
  }

  const voteUrl = `${window.location.origin}/vote/${slug}`;
  const round = contestRound(data);
  const runoff = isRunoffRound(data);
  const inPlay = new Set(activeEntries(data).map((entry) => entry.id));
  const systemLabel =
    VOTING_SYSTEMS.find((item) => item.id === data.voting_system)?.label ??
    data.voting_system;
  const hostToken = getHostToken(slug);

  async function handleStart() {
    if (!slug || !hostToken) return;
    setBusy(true);
    setActionError(null);
    try {
      await startContest(slug, hostToken);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo iniciar la votación.');
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!slug || !hostToken) return;
    const confirmed = window.confirm(
      '¿Cerrar el concurso ahora? Si hay empate, esos dibujos quedarán como ganadores.',
    );
    if (!confirmed) return;
    setBusy(true);
    setActionError(null);
    try {
      await closeContest(slug, hostToken);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cerrar la votación.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(voteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('No se pudo copiar el enlace. Cópialo del campo de dirección.');
    }
  }

  async function shareLink() {
    const contestName = data?.name ?? 'Concurso';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: contestName,
          text: `Vota en ${contestName}`,
          url: voteUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  return (
    <div className="setup host-page">
      <p className="crumb">
        <Link to="/">Inicio</Link>
      </p>
      <header className="setup-header">
        <p className="eyebrow">
          {systemLabel} · {data.duration_minutes}{' '}
          {data.duration_minutes === 1 ? 'minuto' : 'minutos'} ·{' '}
          {data.entries.length}{' '}
          {data.entries.length === 1 ? 'dibujo' : 'dibujos'}
          {runoff ? ` · desempate ronda ${round}` : ''}
        </p>
        <h1>{data.name}</h1>
      </header>

      <section className="share-box">
        <h2>Comparte este enlace</h2>
        <p className="field-hint">
          La gente lo abre, escribe su nombre y vota desde su teléfono.
        </p>
        <div className="share-row">
          <input type="text" readOnly value={voteUrl} />
        </div>
        <div className="share-actions">
          <button type="button" className="primary" onClick={() => void shareLink()}>
            Compartir
          </button>
          <button type="button" onClick={() => void copyLink()}>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
        </div>
        <p>
          <Link to={`/vote/${slug}`}>Abrir la página de voto</Link>
        </p>
      </section>

      {copied && (
        <div className="toast" role="status">
          Enlace copiado
        </div>
      )}

      {data.status === 'draft' && (
        <section className="host-status">
          <p>
            <strong>{data.voter_count}</strong>{' '}
            {data.voter_count === 1 ? 'persona unida' : 'personas unidas'} · la
            votación aún no empieza.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy || data.entries.length < 2}
            onClick={() => void handleStart()}
          >
            Abrir votación por {data.duration_minutes}{' '}
            {data.duration_minutes === 1 ? 'minuto' : 'minutos'}
          </button>
        </section>
      )}

      {data.status === 'open' && data.closes_at && (
        <section className="host-status">
          <p>
            {runoff
              ? `Desempate · ronda ${round}`
              : 'La votación está abierta'}
          </p>
          <Countdown closesAt={data.closes_at} onExpire={() => void reload()} />
          <button type="button" disabled={busy} onClick={() => void handleClose()}>
            Cerrar ahora
          </button>
        </section>
      )}

      {data.status === 'closed' && (
        <section className="host-status">
          <p>La votación está cerrada.</p>
        </section>
      )}

      {actionError && <div className="error">{actionError}</div>}

      <section>
        <div className="section-head">
          <h2>Dibujos</h2>
          <button
            type="button"
            className="chip"
            onClick={() => setShowNames((value) => !value)}
          >
            {showNames ? 'Ocultar nombres' : 'Mostrar nombres'}
          </button>
        </div>
        <ul className="entry-grid host-grid">
          {data.entries.map((entry) => (
            <li
              key={entry.id}
              className={`entry-card static${
                runoff && !inPlay.has(entry.id) ? ' sidelined' : ''
              }`}
            >
              <LightboxImage
                src={publicImageUrl(entry.image_path)}
                alt={showNames ? entry.name : 'Dibujo'}
              />
              {showNames && <div className="entry-caption">{entry.name}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Unidos ({data.voter_count})</h2>
        {data.voter_names.length === 0 ? (
          <p className="muted">Esperando a que se unan…</p>
        ) : (
          <ul className="voter-chips">
            {data.voter_names.map((voterName) => {
              const rebound = (data.rebound_voter_names ?? []).includes(voterName);
              return (
                <li
                  key={voterName}
                  title={
                    rebound
                      ? 'Volvió a entrar desde otro dispositivo antes de votar'
                      : undefined
                  }
                >
                  {voterName}
                  {rebound ? ' · otro dispositivo' : ''}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(data.status === 'open' || data.status === 'closed') && (
        <ContestResults contest={data} showNames={showNames} />
      )}
    </div>
  );
}
