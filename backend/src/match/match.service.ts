import { Injectable } from '@nestjs/common';
import { CreateMatchDto } from './dto/create-match.dto';
import { ApiFootballClient } from '../provider-api-football/services/api-football.client';

@Injectable()
export class MatchService {
  constructor(private readonly apiFootballClient: ApiFootballClient) {}

  create(_createMatchDto: CreateMatchDto) {
    return 'This action adds a new match';
  }

  async fetchLiveMatches(): Promise<Record<string, unknown>[]> {
    const matches = await this.apiFootballClient.fetchLiveFixtures();

    return matches.filter((match: Record<string, unknown>) => {
      return (
        Array.isArray(match?.statistics) &&
        (match.statistics as unknown[]).length > 0 &&
        match?.match_status !== 'Finished'
      );
    });
  }

  filterMatches(matches: Record<string, unknown>[]): Record<string, unknown>[] {
    type StatEntry = { type: string; home: string; away: string };

    return matches.filter((match) => {
      const stats = match.statistics as StatEntry[];
      const statsMiTemps = match.statistics_1half as StatEntry[];
      const matchStatus = match?.match_status as string;
      const tempsJeux =
        matchStatus !== 'Finished' && matchStatus !== 'Half Time'
          ? parseInt(matchStatus.split(':')[0], 10)
          : matchStatus;
      // Extraire les statistiques importantes pour tous le match
      const attacks = stats.find((s) => s.type === 'Attacks');
      const dangerousAttacks = stats.find(
        (s) => s.type === 'Dangerous Attacks',
      );
      const onTarget = stats.find((s) => s.type === 'On Target');
      const shotsTotal = stats.find((s) => s.type === 'Shots Total');
      const shotsInsideBox = stats.find((s) => s.type === 'Shots Inside Box');
      const corners = stats.find((s) => s.type === 'Corners');
      const ballPossession = stats.find((s) => s.type === 'Ball Possession');
      const offTarget = stats.find((s) => s.type === 'Off Target');

      // Extraire les statistiques importantes pour tous la premieres mi_temps

      const attacks1 = statsMiTemps.find((s) => s?.type === 'Attacks');
      const dangerousAttacks1 = statsMiTemps.find(
        (s) => s?.type === 'Dangerous Attacks',
      );
      const onTarget1 = statsMiTemps.find((s) => s?.type === 'On Target');
      const shotsTotal1 = statsMiTemps.find((s) => s?.type === 'Shots Total');
      const shotsInsideBox1 = statsMiTemps.find(
        (s) => s?.type === 'Shots Inside Box',
      );
      const corners1 = statsMiTemps.find((s) => s?.type === 'Corners');
      const offTarget1 = statsMiTemps.find((s) => s?.type === 'Off Target');

      // Convertir les valeurs en nombre pour comparaison
      const homeAttacks = parseInt(attacks?.home);
      const awayAttacks = parseInt(attacks?.away);
      const homeDangerousAttacks = parseInt(dangerousAttacks?.home);
      const awayDangerousAttacks = parseInt(dangerousAttacks?.away);
      const awayOffTarget = parseInt(offTarget?.away);
      const homeOffTarget = parseInt(offTarget?.home);
      const homeOnTarget = parseInt(onTarget?.home);
      const awayOnTarget = parseInt(onTarget?.away);
      const homeShotsTotal = parseInt(shotsTotal?.home);
      const awayShotsTotal = parseInt(shotsTotal?.away);
      const homeShotsInsideBox = parseInt(shotsInsideBox?.home);
      const awayShotsInsideBox = parseInt(shotsInsideBox?.away);
      const homeCorners = parseInt(corners?.home);
      const awayCorners = parseInt(corners?.away);
      const homePossession = parseInt(ballPossession?.home.replace('%', ''));
      const awayPossession = parseInt(ballPossession?.away.replace('%', ''));

      // Convertir les valeurs en nombre pour comparaison premiere mi-tamps
      // NOTE: ces valeurs mi-temps sont extraites mais jamais consommées —
      // evaluatePhase() est appelé avec les stats match complet pour les deux
      // mi-temps (voir plus bas). Conservées en attendant le branchement.
      /* eslint-disable @typescript-eslint/no-unused-vars */
      const homeAttacks1 = parseInt(attacks1?.home);
      const awayAttacks1 = parseInt(attacks1?.away);
      const homeDangerousAttacks1 = parseInt(dangerousAttacks1?.home);
      const awayDangerousAttacks1 = parseInt(dangerousAttacks1?.away);
      const awayOffTarget1 = parseInt(offTarget1?.away);
      const homeOffTarget1 = parseInt(offTarget1?.home);
      const homeOnTarget1 = parseInt(onTarget1?.home);
      const awayOnTarget1 = parseInt(onTarget1?.away);
      const homeShotsTotal1 = parseInt(shotsTotal1?.home);
      const awayShotsTotal1 = parseInt(shotsTotal1?.away);
      const homeShotsInsideBox1 = parseInt(shotsInsideBox1?.home);
      const awayShotsInsideBox1 = parseInt(shotsInsideBox1?.away);
      const homeCorners1 = parseInt(corners1?.home);
      const awayCorners1 = parseInt(corners1?.away);
      const homePossession1 = parseInt(ballPossession?.home.replace('%', ''));
      const awayPossession1 = parseInt(ballPossession?.away.replace('%', ''));
      /* eslint-enable @typescript-eslint/no-unused-vars */

      // Définir les critères pour chaque mi-temps, divisés en 2 parties de 22 minutes
      const evaluatePhase = (
        tempsDeJeux: number | string,
        attacks: number,
        dangerousAttacks: number,
        onTarget: number,
        offTarget: number,
        _shotsTotal: number,
        _shotsInsideBox: number,
        _corners: number,
        _possession: number,
      ) => {
        const tir = onTarget + offTarget;

        if (tempsDeJeux != 'Finished' && tempsDeJeux != 'Half Time') {
          const tempsNum = tempsDeJeux as number;
          if (tempsNum > 0 && tempsNum <= 10) {
            return (
              attacks > 5 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.3 && // au moins 40% des attaques sont dangereuse
              onTarget >= 0 && // au moins 2 tirs cadrés
              tir >= 4
            );
          } else if (tempsNum > 10 && tempsNum < 16) {
            return (
              attacks > 6 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.3 && // au moins 40% des attaques sont dangereuses
              onTarget >= 2 && // au moins 2 tirs cadrés
              tir >= 5
            );
          } else if (tempsNum > 16 && tempsNum < 23) {
            return (
              attacks > 15 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 2 && // au moins 2 tirs cadrés
              tir >= 7
            );
          } else if (tempsNum > 23 && tempsNum < 35) {
            return (
              attacks > 20 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 3 && // au moins 2 tirs cadrés
              tir >= 8
            );
          } else if (tempsNum > 35 && tempsNum < 45) {
            return (
              attacks > 30 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 4 && // au moins 2 tirs cadrés
              tir >= 10
            );
          } else if (tempsNum > 45 && tempsNum < 55) {
            return (
              attacks > 40 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 4 && // au moins 2 tirs cadrés
              tir > 13
            );
          } else if (tempsNum > 55 && tempsNum < 66) {
            return (
              attacks > 40 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 4 && // au moins 2 tirs cadrés
              tir > 15
            );
          } else if (tempsNum > 66 && tempsNum < 78) {
            return (
              attacks > 50 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 5 && // au moins 2 tirs cadrés
              tir > 17
            );
          } else if (tempsNum > 78 && tempsNum < 90) {
            return (
              attacks > 70 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 7 && // au moins 2 tirs cadrés
              tir > 22
            );
          }
        }
        if (tempsDeJeux === 'Finished') {
          return false;
        } else if (tempsDeJeux === 'Half Time') {
          console.log(
            'la mi-temps',
            attacks > 30 && // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
              onTarget >= 3 && // au moins 2 tirs cadrés
              tir > 13,
          );
          return (
            attacks > 30 && // minimum 10 attaques
            dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
            onTarget >= 3 && // au moins 2 tirs cadrés
            tir > 12
          );
        }
      };

      // Diviser les critères en 2 parties de mi-temps
      const homeCriteriaFirstHalf = evaluatePhase(
        tempsJeux,
        homeAttacks,
        homeDangerousAttacks,
        homeOnTarget,
        homeOffTarget,
        homeShotsTotal,
        homeShotsInsideBox,
        homeCorners,
        homePossession,
      );
      const awayCriteriaFirstHalf = evaluatePhase(
        tempsJeux,
        awayAttacks,
        awayDangerousAttacks,
        awayOnTarget,
        awayOffTarget,
        awayShotsTotal,
        awayShotsInsideBox,
        awayCorners,
        awayPossession,
      );

      const homeCriteriaSecondHalf = evaluatePhase(
        tempsJeux,
        homeAttacks,
        homeDangerousAttacks,
        homeOnTarget,
        homeOffTarget,
        homeShotsTotal,
        homeShotsInsideBox,
        homeCorners,
        homePossession,
      );
      const awayCriteriaSecondHalf = evaluatePhase(
        tempsJeux,
        awayAttacks,
        awayDangerousAttacks,
        awayOnTarget,
        awayOffTarget,
        awayShotsTotal,
        awayShotsInsideBox,
        awayCorners,
        awayPossession,
      );

      // Retourne true si une des équipes répond aux critères dans l'une des phases
      return (
        homeCriteriaFirstHalf ||
        awayCriteriaFirstHalf ||
        homeCriteriaSecondHalf ||
        awayCriteriaSecondHalf
      );
    });
  }

  generateCoupons(matches: any[]): any[] {
    console.table(matches);
    return matches.map((match) => ({
      match_id: match.match_id,
      match_status: match.match_status,
      pays: match.country_name,
      league_name: match.league_name,
      teams: `${match.match_hometeam_name} vs ${match.match_awayteam_name}`,
      score: `${match.match_hometeam_score} : ${match.match_awayteam_score}`,
      predicted_outcome: 'But en première mi-temps',
      stat: match.statistics,
      PremiereMitemps: match?.statistics_1half,
    }));
  }
}
