import { useState } from 'react';
import type { Match, MatchSlot, Participant } from '../types';
import { MAX_VOTES_PER_MATCH } from '../types';
import { getMatchOutcome, leadingParticipant } from '../bracket';
import { EditableName } from './EditableName';

type Props = {
  match: Match;
  participantsById: Record<string, Participant>;
  onVote: (matchId: string, slot: MatchSlot) => void;
  onResetVotes: (matchId: string) => void;
  onFinalize: (matchId: string, winnerId: string) => void;
  onFocus: () => void;
  onRenameParticipant: (id: string, name: string) => void;
};

function Slot({
  participant,
  isWinner,
  isLoser,
  votes,
  onRename,
}: {
  participant: Participant | null;
  isWinner: boolean;
  isLoser: boolean;
  votes: number;
  onRename: (name: string) => void;
}) {
  const classes = [
    'slot',
    isWinner && 'winner',
    isLoser && 'loser',
    !participant && 'tbd',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {participant?.imageDataUrl ? (
        <img src={participant.imageDataUrl} alt={participant.name} />
      ) : (
        <span className="avatar placeholder" aria-hidden="true">
          {participant ? participant.name.slice(0, 1).toUpperCase() : '?'}
        </span>
      )}
      {participant ? (
        <EditableName
          variant="slot"
          value={participant.name}
          onChange={onRename}
          ariaLabel="Editar nombre del participante"
        />
      ) : (
        <span className="slot-name">Pendiente</span>
      )}
      <span className="slot-votes">{votes}</span>
    </div>
  );
}

export function MatchCard({
  match,
  participantsById,
  onVote,
  onResetVotes,
  onFinalize,
  onFocus,
  onRenameParticipant,
}: Props) {
  const [tiePicking, setTiePicking] = useState(false);

  const a = match.participantA ? participantsById[match.participantA] : null;
  const b = match.participantB ? participantsById[match.participantB] : null;

  const totalVotes = match.votesA + match.votesB;
  const isFull = totalVotes >= MAX_VOTES_PER_MATCH;
  const isReady = !!a && !!b;
  const isLocked = !!match.winner;
  const leader = leadingParticipant(match);
  const isTied = totalVotes > 0 && match.votesA === match.votesB;

  function handleFinalize() {
    if (!isReady || isLocked) return;
    if (totalVotes === 0) return;
    if (leader) {
      onFinalize(match.id, leader);
      return;
    }
    // Tie: ask user to pick
    setTiePicking(true);
  }

  function handlePickWinner(id: string) {
    setTiePicking(false);
    onFinalize(match.id, id);
  }

  const { winner: winnerParticipant, loser: loserParticipant } = getMatchOutcome(
    match,
    participantsById,
  );

  return (
    <div className={`match-card ${isLocked ? 'locked' : ''}`}>
      {isReady && !isLocked && (
        <button
          type="button"
          className="present-btn"
          onClick={onFocus}
          title="Mostrar el enfrentamiento a pantalla completa"
          aria-label="Presentar enfrentamiento"
        >
          Presentar
        </button>
      )}
      <Slot
        participant={a}
        isWinner={winnerParticipant === a}
        isLoser={loserParticipant === a}
        votes={match.votesA}
        onRename={(name) => a && onRenameParticipant(a.id, name)}
      />
      <Slot
        participant={b}
        isWinner={winnerParticipant === b}
        isLoser={loserParticipant === b}
        votes={match.votesB}
        onRename={(name) => b && onRenameParticipant(b.id, name)}
      />

      {!isLocked && isReady && (
        <div className="match-actions">
          {tiePicking ? (
            <div className="tiebreak">
              <span className="tiebreak-label">¡Empate! Elige un ganador:</span>
              <button
                type="button"
                onClick={() => handlePickWinner(match.participantA!)}
              >
                {a!.name}
              </button>
              <button
                type="button"
                onClick={() => handlePickWinner(match.participantB!)}
              >
                {b!.name}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => setTiePicking(false)}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              <div className="vote-buttons">
                <button
                  type="button"
                  onClick={() => onVote(match.id, 'A')}
                  disabled={isFull}
                  title={`Votar por ${a!.name}`}
                >
                  +1 {a!.name}
                </button>
                <button
                  type="button"
                  onClick={() => onVote(match.id, 'B')}
                  disabled={isFull}
                  title={`Votar por ${b!.name}`}
                >
                  +1 {b!.name}
                </button>
              </div>
              <div className="match-meta">
                <span className="vote-count">
                  {totalVotes}/{MAX_VOTES_PER_MATCH} votos
                </span>
                {totalVotes > 0 && (
                  <>
                    <button
                      type="button"
                      className="link"
                      onClick={() => onResetVotes(match.id)}
                    >
                      Reiniciar
                    </button>
                    <button
                      type="button"
                      className="finalize"
                      onClick={handleFinalize}
                    >
                      {isTied ? 'Finalizar (empate)' : 'Finalizar'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!isLocked && !isReady && (
        <div className="match-waiting">Esperando la ronda anterior…</div>
      )}
    </div>
  );
}
