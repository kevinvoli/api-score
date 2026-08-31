import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  async getLives() {
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY');
    const baseUrl =
      this.configService.get<string>('API_FOOTBALL_BASE_URL') ??
      'https://apiv3.apifootball.com';

    if (!apiKey) {
      throw new Error('Missing API_FOOTBALL_KEY');
    }

    const url = `${baseUrl}/?action=get_events&APIkey=${apiKey}&match_live=1`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP : ${response.status}`);
      }

      const data = await response.json();
      const result = data.filter((match) => match.statistics.length > 1);
      return result;
    } catch (error) {
      console.error("Erreur lors de l'appel API :", error.message);
    }
  }

  filterMatches(matches: any[]): any[] {
    return matches.filter((match) => {
      const stats = match.statistics;

      // Extraire les statistiques importantes
      const attacks = stats.find((s) => s.type === 'Attacks');
      const dangerousAttacks = stats.find(
        (s) => s.type === 'Dangerous Attacks',
      );
      const onTarget = stats.find((s) => s.type === 'On Target');
      const shotsTotal = stats.find((s) => s.type === 'Shots Total');
      const shotsInsideBox = stats.find((s) => s.type === 'Shots Inside Box');
      const corners = stats.find((s) => s.type === 'Corners');
      const ballPossession = stats.find((s) => s.type === 'Ball Possession');

      // Convertir les valeurs en nombre pour comparaison
      const homeAttacks = parseInt(attacks?.home);
      const awayAttacks = parseInt(attacks?.away);
      const homeDangerousAttacks = parseInt(dangerousAttacks?.home);
      const awayDangerousAttacks = parseInt(dangerousAttacks?.away);
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

      // DÃƒÂ©finir les critÃƒÂ¨res pour chaque mi-temps, divisÃƒÂ©s en 2 parties de 22 minutes
      const evaluatePhase = (
        attacks: number,
        dangerousAttacks: number,
        onTarget: number,
        shotsTotal: number,
        shotsInsideBox: number,
        corners: number,
        possession: number,
      ) => {
        return (
          attacks > 10 && // minimum 10 attaques
          dangerousAttacks >= attacks * 0.4 && // au moins 40% des attaques sont dangereuses
          onTarget >= 2 && // au moins 2 tirs cadrÃƒÂ©s
          shotsTotal >= 4 && // au moins 4 tirs
          shotsInsideBox >= 2 && // au moins 2 tirs dans la surface
          corners >= 2 && // au moins 2 corners
          possession >= 50 // possession d'au moins 50%
        );
      };

      // Diviser les critÃƒÂ¨res en 2 parties de mi-temps
      const homeCriteriaFirstHalf = evaluatePhase(
        homeAttacks,
        homeDangerousAttacks,
        homeOnTarget,
        homeShotsTotal,
        homeShotsInsideBox,
        homeCorners,
        homePossession,
      );
      const awayCriteriaFirstHalf = evaluatePhase(
        awayAttacks,
        awayDangerousAttacks,
        awayOnTarget,
        awayShotsTotal,
        awayShotsInsideBox,
        awayCorners,
        awayPossession,
      );

      const homeCriteriaSecondHalf = evaluatePhase(
        homeAttacks,
        homeDangerousAttacks,
        homeOnTarget,
        homeShotsTotal,
        homeShotsInsideBox,
        homeCorners,
        homePossession,
      );
      const awayCriteriaSecondHalf = evaluatePhase(
        awayAttacks,
        awayDangerousAttacks,
        awayOnTarget,
        awayShotsTotal,
        awayShotsInsideBox,
        awayCorners,
        awayPossession,
      );

      // Retourne true si une des ÃƒÂ©quipes rÃƒÂ©pond aux critÃƒÂ¨res dans l'une des phases
      return (
        homeCriteriaFirstHalf ||
        awayCriteriaFirstHalf ||
        homeCriteriaSecondHalf ||
        awayCriteriaSecondHalf
      );
    });
  }
}
