import { Match } from '../entities/match.entity';

export interface MatchRepository {
    getLiveMatches(): Promise<Match[]>;
}
