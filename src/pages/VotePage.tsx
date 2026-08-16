import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { joinContest, publicImageUrl, submitVotes } from '../contest/api';
import { getOrCreateClientToken } from '../contest/tokens';
import { useContest } from '../contest/useContest';
import {
  activeEntries,
  contestRound,
  isRunoffRound,
  VOTING_SYSTEMS,
} from '../contest/types';
import { Countdown } from '../components/Countdown';
import { ContestResults } from '../components/ContestResults';
import { LightboxImage } from '../components/LightboxImage';

export function VotePage() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useContest(slug);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [ranks, setRanks] = useState<string[]>([]);
  const [showNames, setShowNames] = useState(false);

  useEffect(() => {
    setSelected(null);
    setApproved([]);
    setRanks([]);
  }, [data?.id, data?.round]);

  if (!slug) return <Navigate to="/" replace />;
  if (loading && !data) return <p className="setup">Cargando concurso…</p>;
  if (error && !data) {
    return (
      <div className="setup">
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const contestSlug = slug;
  const ballot = activeEntries(data);
  const round = contestRound(data);
  const runoff = isRunoffRound(data);
  const systemLabel =
    VOTING_SYSTEMS.find((item) => item.id === data.voting_system)?.label ??
    data.voting_system;
  const joined = Boolean(data.voter_name);
  const showResults = data.status === 'closed';

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const token = getOrCreateClientToken(contestSlug);
      await joinContest(contestSlug, name, token);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo unir.');
    } finally {
      setBusy(false);
    }
  }

  function toggleApproval(id: string) {
    setApproved((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleRank(id: string) {
    setRanks((current) => {
      const existing = current.indexOf(id);
      if (existing >= 0) return current.slice(0, existing);
      return [...current, id];
    });
  }

  function isSelected(id: string): boolean {
    if (!data) return false;
    if (data.voting_system === 'plurality') return selected === id;
    if (data.voting_system === 'approval') return approved.includes(id);
    return ranks.includes(id);
  }

  async function handleSubmit() {
    if (!data) return;
    setBusy(true);
    setFormError(null);
    try {
      const token = getOrCreateClientToken(contestSlug);
      const votes =
        data.voting_system === 'plurality' && selected
          ? [{ entry_id: selected, rank: 1 }]
          : data.voting_system === 'approval'
            ? approved.map((id) => ({ entry_id: id, rank: 1 }))
            : ranks.map((id, index) => ({ entry_id: id, rank: index + 1 }));
      await submitVotes(contestSlug, token, votes);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo enviar tu voto.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    ((data.voting_system === 'plurality' && selected) ||
      (data.voting_system === 'approval' && approved.length > 0) ||
      (data.voting_system === 'ranked' && ranks.length === ballot.length));

  return (
    <div className="setup vote-page">
      <header className="setup-header">
        <p className="eyebrow">
          {systemLabel}
          {runoff ? ` · Desempate ronda ${round}` : ''}
        </p>
        <h1>{data.name}</h1>
        <button
          type="button"
          className="chip"
          onClick={() => setShowNames((value) => !value)}
        >
          {showNames ? 'Ocultar nombres' : 'Mostrar nombres'}
        </button>
      </header>

      {data.status === 'open' && data.closes_at && (
        <div className="vote-timer">
          <span>{runoff ? 'El desempate cierra en' : 'La votación cierra en'}</span>
          <Countdown closesAt={data.closes_at} onExpire={() => void reload()} />
        </div>
      )}

      {showResults && <ContestResults contest={data} showNames={showNames} />}

      {!joined && data.status !== 'closed' && (
        <form className="setup-form" onSubmit={(event) => void handleJoin(event)}>
          <h2>Entra con tu nombre</h2>
          <p className="field-hint">
            {runoff
              ? 'Si ya votaste en la ronda anterior, escribe el mismo nombre para votar otra vez.'
              : 'Así sabemos quién ya votó. Si cierras la página, entra con el mismo nombre.'}
          </p>
          <div className="form-row">
            <input
              type="text"
              placeholder="Tu nombre"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="primary" disabled={busy || name.trim().length < 1}>
              {busy ? 'Entrando…' : 'Continuar'}
            </button>
          </div>
        </form>
      )}

      {joined && data.status === 'draft' && (
        <div className="waiting-card">
          <p>
            Estás dentro como <strong>{data.voter_name}</strong>. Esperando a
            que empiece la votación…
          </p>
        </div>
      )}

      {joined && data.status === 'open' && data.has_voted && (
        <div className="waiting-card">
          <p>
            Gracias, <strong>{data.voter_name}</strong>. Tu voto de esta ronda
            ya está registrado.
          </p>
        </div>
      )}

      {joined && data.status === 'open' && !data.has_voted && (
        <>
          <p className="ballot-instructions">
            {runoff &&
              'Estos dibujos empataron. Vota otra vez para elegir un ganador. '}
            {data.voting_system === 'plurality' &&
              'Toca un dibujo para verlo en grande y pulsa Elegir.'}
            {data.voting_system === 'approval' &&
              'Toca los dibujos para verlos y pulsa Elegir en todos los que te gusten.'}
            {data.voting_system === 'ranked' &&
              'Toca un dibujo para verlo y pulsa Elegir en orden, del más al menos favorito.'}
          </p>
          <ul className="entry-grid">
            {ballot.map((entry) => {
              const rank = ranks.indexOf(entry.id);
              return (
                <li key={entry.id}>
                  <div
                    className={`entry-card${isSelected(entry.id) ? ' selected' : ''}`}
                  >
                    {rank >= 0 && <span className="rank-badge">{rank + 1}</span>}
                    {data.voting_system !== 'ranked' && (
                      <span
                        className={`select-mark${isSelected(entry.id) ? ' on' : ''}`}
                        aria-hidden="true"
                      >
                        {isSelected(entry.id) ? '✓' : '+'}
                      </span>
                    )}
                    <LightboxImage
                      src={publicImageUrl(entry.image_path)}
                      alt={showNames ? entry.name : 'Dibujo'}
                    />
                    <button
                      type="button"
                      className="entry-select"
                      onClick={() => {
                        if (data.voting_system === 'plurality') setSelected(entry.id);
                        if (data.voting_system === 'approval') toggleApproval(entry.id);
                        if (data.voting_system === 'ranked') toggleRank(entry.id);
                      }}
                    >
                      <span className="entry-caption">
                        {showNames
                          ? entry.name
                          : isSelected(entry.id)
                            ? 'Elegido'
                            : 'Elegir'}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="setup-actions sticky-cta">
            <button
              type="button"
              className="primary"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {busy ? 'Enviando…' : 'Enviar voto'}
            </button>
          </div>
        </>
      )}

      {formError && <div className="error">{formError}</div>}

      {data.is_host && (
        <p className="host-switch">
          <Link to={`/contest/${contestSlug}`}>Volver a la vista de organizador</Link>
        </p>
      )}
    </div>
  );
}
