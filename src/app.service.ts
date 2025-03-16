import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {live} from './schemat/livedata'

@Injectable()
export class AppService {
  private readonly apiUrl = 'https://livescore6.p.rapidapi.com/matches/v2/list-live?Category=soccer&Timezone=-7' ; // Remplacez par l'URL de votre API
  private readonly authToken = 'x-rapidapi-key: 9a928af7949303ea4aa82e5c6b71a0ed6d90bbbeebdee1eafde68715adac25f3'; 
  private readonly rapidApiHost = 'livescore6.p.rapidapi.com';
  private readonly datas = live;
  getHello(): string {
    return 'Hello World!';
  }

  async getLives(){
    const APIkey = "9a928af7949303ea4aa82e5c6b71a0ed6d90bbbeebdee1eafde68715adac25f3";
    const firstTeamId = 93;
    const secondTeamId = 4973;
    const met  = {
      lives:`https://apiv3.apifootball.com/?action=get_events&APIkey=${APIkey}`,
      countries:'Countries',
      Leagues: 'Leagues',
    }
    const countryId = '3'
    const from = '2024-12-24'
    const to  = '2021-05-18'

    const get_leagues = 'get_leagues';
    // const url = `https://apiv2.allsportsapi.com/football/?met=${met.lives}&APIkey=${APIkey}`;
    const url= `https://apiv3.apifootball.com/?action=get_events&APIkey=${APIkey}&match_live=1`
  
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // timeout: 30000, // 30 secondes (optionnel, nécessite un polyfill dans Node.js)
      });
  
      if (!response.ok) {
        throw new Error(`Erreur HTTP : ${response.status}`);
      }
      const data = await response.json();
      console.log('ici les data',data); // Affiche les résultats dans la console

      const result= data.filter(match => match.statistics.length> 1)
      console.log('ici les data',result); // Affiche les résultats dans la console
      return result
    } catch (error) {
      console.error("Erreur lors de l'appel API :", error.message);
    }
  }

  async teste(){
    console.log('un live:', this.datas[1]);
    const affiche= [] 
    await this.datas.forEach(element => {
      affiche.push({
        temps_de_jeux : element.match_status,
        equipe1 : element.match_hometeam_name,
        equipe2: element.match_awayteam_name,
        scrore: `${element.match_hometeam_score} : ${element.match_awayteam_score}`,
        statistic : element.statistics
      }) 
    });
    
    console.log('les live:', affiche);
    
    return affiche
  }

  filterMatches(matches: any[]): any[] {
    return matches.filter((match) => {
      const stats = match.statistics;
  
      // Extraire les statistiques importantes
      const attacks = stats.find((s) => s.type === 'Attacks');
      const dangerousAttacks = stats.find((s) => s.type === 'Dangerous Attacks');
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
  
      // Définir les critères pour chaque mi-temps, divisés en 2 parties de 22 minutes
      const evaluatePhase = (attacks: number, dangerousAttacks: number, onTarget: number, shotsTotal: number, shotsInsideBox: number, corners: number, possession: number) => {
        return (
          attacks > 10 &&  // minimum 10 attaques
          dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
          onTarget >= 2 &&  // au moins 2 tirs cadrés
          shotsTotal >= 4 &&  // au moins 4 tirs
          shotsInsideBox >= 2 &&  // au moins 2 tirs dans la surface
          corners >= 2 &&  // au moins 2 corners
          possession >= 50  // possession d'au moins 50%
        );
      };
  
      // Diviser les critères en 2 parties de mi-temps
      const homeCriteriaFirstHalf = evaluatePhase(homeAttacks, homeDangerousAttacks, homeOnTarget, homeShotsTotal, homeShotsInsideBox, homeCorners, homePossession);
      const awayCriteriaFirstHalf = evaluatePhase(awayAttacks, awayDangerousAttacks, awayOnTarget, awayShotsTotal, awayShotsInsideBox, awayCorners, awayPossession);
  
      const homeCriteriaSecondHalf = evaluatePhase(homeAttacks, homeDangerousAttacks, homeOnTarget, homeShotsTotal, homeShotsInsideBox, homeCorners, homePossession);
      const awayCriteriaSecondHalf = evaluatePhase(awayAttacks, awayDangerousAttacks, awayOnTarget, awayShotsTotal, awayShotsInsideBox, awayCorners, awayPossession);
  
      // Retourne true si une des équipes répond aux critères dans l'une des phases
      return (
        (homeCriteriaFirstHalf || awayCriteriaFirstHalf) ||
        (homeCriteriaSecondHalf || awayCriteriaSecondHalf)
      );
    });

    
  }
  

}
