export type Participant = {
  id: string;
  name: string;
  imageDataUrl?: string;
};

export type MatchSlot = 'A' | 'B';

export type Match = {
  id: string;
  round: number;
  slotIndex: number;
  participantA: string | null;
  participantB: string | null;
  votesA: number;
  votesB: number;
  winner: string | null;
  nextMatchId: string | null;
  nextSlot: MatchSlot | null;
};

export type Tournament = {
  participants: Participant[];
  matches: Match[];
  started: boolean;
  champion: string | null;
};

export const ROUND_NAMES: Record<number, string> = {
  0: 'Play-in',
  1: 'Round of 16',
  2: 'Quarterfinals',
  3: 'Semifinals',
  4: 'Final',
};

export const MAX_VOTES_PER_MATCH = 8;
export const TARGET_PARTICIPANTS = 20;
