import { publicImageUrl } from '../contest/api';
import { tallyVotes } from '../contest/tally';
import {
  activeEntries,
  contestRound,
  isRunoffRound,
  VOTING_SYSTEMS,
  type ContestView,
} from '../contest/types';
import { LightboxImage } from './LightboxImage';

type Props = {
  contest: ContestView;
  showNames?: boolean;
};

export function ContestResults({ contest, showNames = false }: Props) {
  const votes = contest.votes ?? [];
  const entries = activeEntries(contest);
  const tally = tallyVotes(
    contest.voting_system,
    entries.map((entry) => entry.id),
    contest.votes,
  );
  const maxVotes = Math.max(1, ...tally.ranking.map((row) => row.voteCount));
  const byId = new Map(contest.entries.map((entry) => [entry.id, entry]));
  const systemLabel =
    VOTING_SYSTEMS.find((item) => item.id === contest.voting_system)?.label ??
    contest.voting_system;
  const winners = tally.winnerIds
    .map((id) => byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const closed = contest.status === 'closed';
  const runoff = isRunoffRound(contest);
  const round = contestRound(contest);
  const ballotCount = new Set(votes.map((vote) => vote.voter_id)).size;
  const heading = closed
    ? 'Resultados finales'
    : runoff
      ? `Desempate · ronda ${round}`
      : 'Resultados en vivo';

  return (
    <section className="results">
      {closed && winners.length === 1 && (
        <div className="champion-banner">
          <div className="champion-label">Ganador</div>
          <div className="winner-row">
            {winners.map((entry) => (
              <div key={entry.id} className="champion-body">
                <LightboxImage
                  src={publicImageUrl(entry.image_path)}
                  alt={showNames ? entry.name : 'Dibujo ganador'}
                />
                {showNames && <div className="champion-name">{entry.name}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {closed && winners.length > 1 && (
        <div className="champion-banner">
          <div className="champion-label">Empate</div>
          <p className="field-hint">El resultado es un empate.</p>
          <div className="winner-row">
            {winners.map((entry) => (
              <div key={entry.id} className="champion-body">
                <LightboxImage
                  src={publicImageUrl(entry.image_path)}
                  alt={showNames ? entry.name : 'Dibujo empatado'}
                />
                {showNames && <div className="champion-name">{entry.name}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="results-heading">
        <h2>{heading}</h2>
        <p>
          {systemLabel}
          {runoff ? ` · ronda ${round}` : ''}
          {' \u00b7 '}
          {ballotCount} {ballotCount === 1 ? 'voto' : 'votos'}
          {contest.voting_system === 'ranked' ? ' · primeras preferencias' : null}
        </p>
      </div>

      {runoff && !closed && (
        <p className="field-hint">
          Estos dibujos empataron. Hay que votar otra vez para elegir un ganador.
        </p>
      )}

      {ballotCount === 0 ? (
        <p className="muted">Aún no hay votos.</p>
      ) : (
        <ol className="results-list">
          {tally.ranking.map((row) => {
            const entry = byId.get(row.entryId);
            if (!entry) return null;
            const isWinner =
              closed && winners.length === 1 && tally.winnerIds.includes(entry.id);
            return (
              <li key={entry.id} className={isWinner ? 'winner' : undefined}>
                <span className="results-place">{row.place}</span>
                <LightboxImage
                  src={publicImageUrl(entry.image_path)}
                  alt={showNames ? entry.name : `Dibujo ${row.place}`}
                />
                <div className="results-meta">
                  {showNames && <strong>{entry.name}</strong>}
                  <div className="results-bar-track">
                    <div
                      className="results-bar"
                      style={{ width: `${(row.voteCount / maxVotes) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="results-count">
                  {row.voteCount}
                  {contest.voting_system === 'approval' ? ' sí' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
