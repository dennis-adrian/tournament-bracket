import { publicImageUrl } from '../contest/api';
import { tallyVotes } from '../contest/tally';
import { VOTING_SYSTEMS, type ContestView } from '../contest/types';

type Props = {
  contest: ContestView;
  showNames?: boolean;
};

export function ContestResults({ contest, showNames = false }: Props) {
  const votes = contest.votes ?? [];
  const entryIds = contest.entries.map((entry) => entry.id);
  const liveRanked = contest.voting_system === 'ranked' && contest.status !== 'closed';
  const votesForTally = liveRanked
    ? votes.filter((vote) => vote.rank === 1)
    : contest.votes;
  const tally = tallyVotes(
    liveRanked ? 'plurality' : contest.voting_system,
    entryIds,
    votesForTally,
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
  const ballotCount = new Set(votes.map((vote) => vote.voter_id)).size;

  return (
    <section className="results">
      {closed && winners.length > 0 && (
        <div className="champion-banner">
          <div className="champion-label">
            {winners.length > 1 ? 'Empate' : 'Ganador'}
          </div>
          <div className="winner-row">
            {winners.map((entry) => (
              <div key={entry.id} className="champion-body">
                <img
                  src={publicImageUrl(entry.image_path)}
                  alt={showNames ? entry.name : 'Dibujo ganador'}
                />
                {showNames && <div className="champion-name">{entry.name}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="results-heading">
        <h2>{closed ? 'Resultados finales' : 'Resultados en vivo'}</h2>
        <p>
          {systemLabel}
          {' \u00b7 '}
          {ballotCount} {ballotCount === 1 ? 'voto' : 'votos'}
          {contest.voting_system === 'ranked' && !closed
            ? ' \u00b7 primeras preferencias'
            : null}
        </p>
      </div>

      {ballotCount === 0 ? (
        <p className="muted">Aún no hay votos.</p>
      ) : (
        <ol className="results-list">
          {tally.ranking.map((row) => {
            const entry = byId.get(row.entryId);
            if (!entry) return null;
            const isWinner = closed && tally.winnerIds.includes(entry.id);
            return (
              <li key={entry.id} className={isWinner ? 'winner' : undefined}>
                <span className="results-place">{row.place}</span>
                <img
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
