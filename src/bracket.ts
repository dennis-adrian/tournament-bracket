import type { Match, MatchSlot, Participant, Tournament } from './types';
import { MAX_VOTES_PER_MATCH } from './types';

function makeMatch(id: string, round: number, slotIndex: number): Match {
  return {
    id,
    round,
    slotIndex,
    participantA: null,
    participantB: null,
    votesA: 0,
    votesB: 0,
    winner: null,
    nextMatchId: null,
    nextSlot: null,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Build a 20 -> 16 -> 8 -> 4 -> 2 -> 1 bracket.
 *
 * Rounds:
 *   0 = Play-in      (4 matches, 8 participants)
 *   1 = Round of 16  (8 matches, 16 participants)
 *   2 = Quarterfinal (4 matches)
 *   3 = Semifinal    (2 matches)
 *   4 = Final        (1 match)
 *
 * Seeding: participants are shuffled. The first 12 are placed directly into
 * R16. The last 8 play the 4 play-in matches. Play-in winners are distributed
 * across R16 slots 1, 7, 9, 15 so each faces a top-seed in R16.
 */
export function generateBracket(participants: Participant[]): Tournament {
  if (participants.length !== 20) {
    throw new Error(`Se esperaban 20 participantes, hay ${participants.length}`);
  }

  const shuffled = shuffle(participants);
  const top12 = shuffled.slice(0, 12);
  const playInPlayers = shuffled.slice(12, 20);

  const matches: Match[] = [];

  // Round 4: Final
  const final = makeMatch('m-4-0', 4, 0);
  matches.push(final);

  // Round 3: Semifinals
  const sf: Match[] = [];
  for (let i = 0; i < 2; i++) {
    const m = makeMatch(`m-3-${i}`, 3, i);
    m.nextMatchId = final.id;
    m.nextSlot = i === 0 ? 'A' : 'B';
    sf.push(m);
  }
  matches.push(...sf);

  // Round 2: Quarterfinals
  const qf: Match[] = [];
  for (let i = 0; i < 4; i++) {
    const m = makeMatch(`m-2-${i}`, 2, i);
    m.nextMatchId = sf[Math.floor(i / 2)].id;
    m.nextSlot = i % 2 === 0 ? 'A' : 'B';
    qf.push(m);
  }
  matches.push(...qf);

  // Round 1: Round of 16
  const r16: Match[] = [];
  for (let i = 0; i < 8; i++) {
    const m = makeMatch(`m-1-${i}`, 1, i);
    m.nextMatchId = qf[Math.floor(i / 2)].id;
    m.nextSlot = i % 2 === 0 ? 'A' : 'B';
    r16.push(m);
  }
  matches.push(...r16);

  // R16 has 16 slots: match i has slot 2i (A) and 2i+1 (B).
  // Distribute top 12 into these 12 slots; reserve slots 1, 7, 9, 15 for
  // play-in winners so each is paired against a top-seed.
  const top12Slots = [0, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14];
  const playInSlots: number[] = [1, 7, 9, 15];

  top12.forEach((p, i) => {
    const slot = top12Slots[i];
    const matchIdx = Math.floor(slot / 2);
    const side = slot % 2 === 0 ? 'participantA' : 'participantB';
    r16[matchIdx][side] = p.id;
  });

  // Round 0: Play-in
  const playIn: Match[] = [];
  for (let i = 0; i < 4; i++) {
    const targetR16Slot = playInSlots[i];
    const targetMatchIdx = Math.floor(targetR16Slot / 2);
    const targetSide: MatchSlot = targetR16Slot % 2 === 0 ? 'A' : 'B';
    const m = makeMatch(`m-0-${i}`, 0, i);
    m.participantA = playInPlayers[i * 2].id;
    m.participantB = playInPlayers[i * 2 + 1].id;
    m.nextMatchId = r16[targetMatchIdx].id;
    m.nextSlot = targetSide;
    playIn.push(m);
  }
  matches.push(...playIn);

  return {
    participants,
    matches,
    started: true,
    champion: null,
  };
}

export function castVote(
  tournament: Tournament,
  matchId: string,
  slot: MatchSlot,
): Tournament {
  const matches = tournament.matches.map((m) => {
    if (m.id !== matchId) return m;
    if (m.winner) return m;
    if (m.votesA + m.votesB >= MAX_VOTES_PER_MATCH) return m;
    if (!m.participantA || !m.participantB) return m;
    return {
      ...m,
      votesA: slot === 'A' ? m.votesA + 1 : m.votesA,
      votesB: slot === 'B' ? m.votesB + 1 : m.votesB,
    };
  });
  return { ...tournament, matches };
}

export function resetVotes(tournament: Tournament, matchId: string): Tournament {
  const matches = tournament.matches.map((m) => {
    if (m.id !== matchId) return m;
    if (m.winner) return m;
    return { ...m, votesA: 0, votesB: 0 };
  });
  return { ...tournament, matches };
}

export function finalizeMatch(
  tournament: Tournament,
  matchId: string,
  winnerId: string,
): Tournament {
  const matches = tournament.matches.map((m) => ({ ...m }));
  const match = matches.find((m) => m.id === matchId);
  if (!match) return tournament;
  if (match.winner) return tournament;
  if (match.participantA !== winnerId && match.participantB !== winnerId) {
    return tournament;
  }

  match.winner = winnerId;

  let champion = tournament.champion;

  if (match.nextMatchId) {
    const next = matches.find((m) => m.id === match.nextMatchId);
    if (next) {
      if (match.nextSlot === 'A') next.participantA = winnerId;
      else if (match.nextSlot === 'B') next.participantB = winnerId;
    }
  } else {
    champion = winnerId;
  }

  return { ...tournament, matches, champion };
}

/** Determine the leading participant (or null if tied/no votes). */
export function leadingParticipant(match: Match): string | null {
  if (match.votesA === 0 && match.votesB === 0) return null;
  if (match.votesA > match.votesB) return match.participantA;
  if (match.votesB > match.votesA) return match.participantB;
  return null;
}

export type MatchOutcome = {
  winner: Participant | null;
  loser: Participant | null;
};

/**
 * Resolve a finalized match into its winner/loser participants. Returns
 * `{ winner: null, loser: null }` if the match hasn't been finalized yet.
 */
export function getMatchOutcome(
  match: Match,
  participantsById: Record<string, Participant>,
): MatchOutcome {
  if (!match.winner) return { winner: null, loser: null };
  const winner = participantsById[match.winner] ?? null;
  const loserId =
    match.winner === match.participantA
      ? match.participantB
      : match.participantA;
  const loser = loserId ? (participantsById[loserId] ?? null) : null;
  return { winner, loser };
}

export function matchesByRound(tournament: Tournament): Match[][] {
  const rounds: Match[][] = [[], [], [], [], []];
  for (const m of tournament.matches) {
    rounds[m.round].push(m);
  }
  for (const r of rounds) {
    r.sort((a, b) => a.slotIndex - b.slotIndex);
  }
  return rounds;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
