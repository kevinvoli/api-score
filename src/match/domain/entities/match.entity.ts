import { Match as MatchModel, Statistic } from '../models/match.model';

export class Match implements MatchModel {
    match_id: string;
    country_name: string;
    league_name: string;
    match_status: string;
    match_hometeam_name: string;
    match_awayteam_name: string;
    match_hometeam_score: string;
    match_awayteam_score: string;
    statistics: Statistic[];
    statistics_1half: Statistic[];
}
