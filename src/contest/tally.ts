import type { ContestVote, VotingSystem } from './types';

export type RankedEntry = {
  entryId: string;
  voteCount: number;
  place: number;
};

export type TallyResult = {
  ranking: RankedEntry[];
  winnerIds: string[];
};

function assignPlaces(sorted: { entryId: string; voteCount: number }[]): RankedEntry[] {
  return sorted.map((row, index) => {
    const prev = sorted[index - 1];
    const place =
      prev && prev.voteCount === row.voteCount
        ? sorted.findIndex((item) => item.voteCount === row.voteCount) + 1
        : index + 1;
    return { ...row, place };
  });
}

function countMap(entryIds: string[], votes: ContestVote[]): Map<string, number> {
  const counts = new Map(entryIds.map((id) => [id, 0]));
  for (const vote of votes) {
    counts.set(vote.entry_id, (counts.get(vote.entry_id) ?? 0) + 1);
  }
  return counts;
}

function rankingFromCounts(
  entryIds: string[],
  counts: Map<string, number>,
): TallyResult {
  const sorted = [...entryIds]
    .map((entryId) => ({ entryId, voteCount: counts.get(entryId) ?? 0 }))
    .sort((a, b) => b.voteCount - a.voteCount || a.entryId.localeCompare(b.entryId));
  const ranking = assignPlaces(sorted);
  const top = ranking[0]?.voteCount ?? 0;
  const winnerIds =
    ranking.filter((row) => row.voteCount === top && top > 0).map((row) => row.entryId);
  return { ranking, winnerIds };
}

export function tallyVotes(
  system: VotingSystem,
  entryIds: string[],
  votes: ContestVote[] | null,
): TallyResult {
  const rows = votes ?? [];
  const scored =
    system === 'ranked' ? rows.filter((vote) => vote.rank === 1) : rows;
  return rankingFromCounts(entryIds, countMap(entryIds, scored));
}
