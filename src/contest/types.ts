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
  is_host: boolean;
  has_voted: boolean;
  voter_name: string | null;
  entries: ContestEntry[];
  voter_count: number;
  voter_names: string[];
  votes: ContestVote[] | null;
};

export const VOTING_SYSTEMS: {
  id: VotingSystem;
  label: string;
  summary: string;
}[] = [
  {
    id: 'plurality',
    label: 'Elige uno',
    summary: 'Cada persona vota por un solo favorito. Gana quien más votos tenga.',
  },
  {
    id: 'approval',
    label: 'Aprobación',
    summary: 'Vota por todos los dibujos que te gusten. Gana quien más aprobaciones tenga.',
  },
  {
    id: 'ranked',
    label: 'Ranking',
    summary:
      'Ordena todos los dibujos de más a menos favorito. El último lugar se elimina hasta que quede un ganador.',
  },
];
