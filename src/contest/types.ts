export type VotingSystem = 'plurality' | 'approval' | 'ranked';
export type ContestStatus = 'draft' | 'open' | 'closed';

export type ContestEntry = {
  id: string;
  name: string;
  image_path: string;
  sort_order: number;
};

export type ContestVote = {
  entry_id: string;
  rank: number;
  voter_id: string;
  voter_name: string | null;
};

export type ContestView = {
  id: string;
  slug: string;
  name: string;
  voting_system: VotingSystem;
  duration_minutes: number;
  status: ContestStatus;
  starts_at: string | null;
  closes_at: string | null;
  round: number;
  active_entry_ids: string[] | null;
  is_host: boolean;
  has_voted: boolean;
  voter_name: string | null;
  entries: ContestEntry[];
  voter_count: number;
  voter_names: string[];
  rebound_voter_names: string[];
  votes: ContestVote[] | null;
};

export function contestRound(contest: Pick<ContestView, 'round'>): number {
  return Number.isFinite(contest.round) && contest.round >= 1 ? contest.round : 1;
}

export function activeEntries(contest: ContestView): ContestEntry[] {
  const ids = contest.active_entry_ids;
  if (!ids || ids.length < 2) return contest.entries;
  const allowed = new Set(ids);
  const filtered = contest.entries.filter((entry) => allowed.has(entry.id));
  return filtered.length >= 2 ? filtered : contest.entries;
}

export function isRunoffRound(contest: ContestView): boolean {
  return contestRound(contest) > 1;
}

export const VOTING_SYSTEMS: {
  id: VotingSystem;
  label: string;
  summary: string;
}[] = [
  {
    id: 'plurality',
    label: 'Elige uno',
    summary: 'Cada persona vota por un solo favorito. Gana quien más votos tenga. Si hay empate, esos dibujos pasan a otra ronda.',
  },
  {
    id: 'approval',
    label: 'Aprobación',
    summary: 'Vota por todos los dibujos que te gusten. Gana quien más aprobaciones tenga. Si hay empate, esos dibujos pasan a otra ronda.',
  },
  {
    id: 'ranked',
    label: 'Ranking',
    summary:
      'Ordena todos los dibujos de más a menos favorito. Si hay empate, esos dibujos pasan a otra ronda.',
  },
];
