import { Injectable } from '@nestjs/common';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { lastValueFrom } from 'rxjs';
import { log } from 'console';



@Injectable()
export class MatchService {

  
    private readonly apiKey = '31ba086dcbe9820abdc7f6e5ed3ff975e6fbd06bcc101bd49855c700ceebe2f7'
  
  create(createMatchDto: CreateMatchDto) {
    return 'This action adds a new match';
  }
    async  fetchLiveMatches(): Promise<any[]> {
      const url= `https://apiv3.apifootball.com/?action=get_events&APIkey=${this.apiKey}&match_live=1`
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
    
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });
    
        if (!response.ok) {
          throw new Error(`Erreur HTTP : ${response.status} ${response.statusText}`);
        }
    
        
        const matches = await response.json();
        // console.log(matches);
        
        // Vérifie que les données sont un tableau
        if (!Array.isArray(matches)) {
          throw new Error("Les données reçues ne sont pas un tableau de matchs.");
        }
    
        // Filtre les matchs qui ont des statistiques
        const validMatches = matches.filter((match: any) => {
          return Array.isArray(match?.statistics) && match?.statistics.length > 0 && match?.match_status !=="Finished";
        });
    
        return validMatches;
      } catch (error) {
        if (error.name === "AbortError") {
          console.error("La requête a expiré (timeout).");
        } else {
          console.error(`Erreur lors de l'appel API : ${error.message}`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    

  
    filterMatches(matches: any[]): any[] {
      return matches.filter((match) => {
        const stats = match.statistics;
        const statsMiTemps = match.statistics_1half
        let tempsJeux ;
        if (match?.match_status !="Finished" && match?.match_status!="Half Time" ) {
          tempsJeux = parseInt(match.match_status.split(':')[0],10)
        }
        tempsJeux = match.match_status;
        // Extraire les statistiques importantes pour tous le match
        const attacks = stats.find((s) => s.type === 'Attacks');
        const dangerousAttacks = stats.find((s) => s.type === 'Dangerous Attacks');
        const onTarget = stats.find((s) => s.type === 'On Target');
        const shotsTotal = stats.find((s) => s.type === 'Shots Total');
        const shotsInsideBox = stats.find((s) => s.type === 'Shots Inside Box');
        const corners = stats.find((s) => s.type === 'Corners');
        const ballPossession = stats.find((s) => s.type === 'Ball Possession');
        const offTarget = stats.find((s) => s.type === 'Off Target');
        
        // Extraire les statistiques importantes pour tous la premieres mi_temps

        
        const attacks1 = statsMiTemps.find((s) => s?.type === 'Attacks');
        const dangerousAttacks1 = statsMiTemps.find((s) => s?.type === 'Dangerous Attacks');
        const onTarget1 = statsMiTemps.find((s) => s?.type === 'On Target');
        const shotsTotal1 = statsMiTemps.find((s) => s?.type === 'Shots Total');
        const shotsInsideBox1 = statsMiTemps.find((s) => s?.type === 'Shots Inside Box');
        const corners1 = statsMiTemps.find((s) => s?.type === 'Corners');
        const ballPossession1 = statsMiTemps.find((s) => s?.type === 'Ball Possession');
        const offTarget1 = statsMiTemps.find((s) => s?.type === 'Off Target');


    
        // Convertir les valeurs en nombre pour comparaison
        const homeAttacks = parseInt(attacks?.home);
        const awayAttacks = parseInt(attacks?.away);
        const homeDangerousAttacks = parseInt(dangerousAttacks?.home);
        const awayDangerousAttacks = parseInt(dangerousAttacks?.away);
        const awayOffTarget =  parseInt(offTarget?.away);
        const homeOffTarget =  parseInt(offTarget?.home);
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

        const homeAttacks1 = parseInt(attacks1?.home);
        const awayAttacks1 = parseInt(attacks1?.away);
        const homeDangerousAttacks1 = parseInt(dangerousAttacks1?.home);
        const awayDangerousAttacks1 = parseInt(dangerousAttacks1?.away);
        const awayOffTarget1 =  parseInt(offTarget1?.away);
        const homeOffTarget1 =  parseInt(offTarget1?.home);
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


        // Définir les critères pour chaque mi-temps, divisés en 2 parties de 22 minutes
        const evaluatePhase = (tempsDeJeux, attacks: number, dangerousAttacks: number, onTarget: number,offTarget:number, shotsTotal: number, shotsInsideBox: number, corners: number, possession: number) => {
          const tir = onTarget+ offTarget
          
          if (tempsDeJeux !="Finished" && tempsDeJeux!="Half Time" ) {
            
            if (tempsDeJeux > 0 && tempsDeJeux <= 10) {
              return (
                attacks > 5 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.3 &&  // au moins 40% des attaques sont dangereuse
                onTarget >=0 &&  // au moins 2 tirs cadrés
                  tir >=4
              );
            } else if (tempsDeJeux > 10 && tempsDeJeux < 16) {
              
              return (
                attacks > 6 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.3 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 2 &&  // au moins 2 tirs cadrés
                tir >=5
              );
            }  else if (tempsDeJeux > 16 && tempsDeJeux < 23) {
              
              return (
                attacks > 15 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 2 &&  // au moins 2 tirs cadrés
                tir >=7
              );
            } else if (tempsDeJeux > 23 && tempsDeJeux < 35) {
              
              return (
                attacks > 20 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 3 &&  // au moins 2 tirs cadrés
                tir >=8
              );
            }else if (tempsDeJeux > 35 && tempsDeJeux < 45) {
            
              
              return (
                attacks > 30 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 4 &&  // au moins 2 tirs cadrés
                tir >=10
              );
            } else if (tempsDeJeux > 45 && tempsDeJeux < 55){
              return (
                attacks > 40 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 4 && // au moins 2 tirs cadrés
                tir>13
              );
            }else if (tempsDeJeux > 55 && tempsDeJeux < 66){
              return (
                attacks > 40 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 4 && // au moins 2 tirs cadrés
                tir>15
              );
            }else if (tempsDeJeux > 66 && tempsDeJeux < 78){
              return (
                attacks > 50 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 5 && // au moins 2 tirs cadrés
                tir>17
              );
            } else if (tempsDeJeux > 78 && tempsDeJeux < 90) {
              return (
                attacks > 70 &&  // minimum 10 attaques
                dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                onTarget >= 7 &&  // au moins 2 tirs cadrés
                tir>22
              );
            }
          }if (tempsDeJeux ==="Finished") {
            return false
          } else if (tempsDeJeux ==="Half Time") {
            console.log("la mi-temps",(attacks > 30 &&  // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
              onTarget >= 3 &&  // au moins 2 tirs cadrés
              tir>13));
            return (
              attacks > 30 &&  // minimum 10 attaques
              dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
              onTarget >= 3 &&  // au moins 2 tirs cadrés
              tir>12
            );
          }

       
        };
    
        // Diviser les critères en 2 parties de mi-temps
        const homeCriteriaFirstHalf = evaluatePhase( tempsJeux,homeAttacks, homeDangerousAttacks, homeOnTarget,homeOffTarget, homeShotsTotal, homeShotsInsideBox, homeCorners, homePossession);
        const awayCriteriaFirstHalf = evaluatePhase(tempsJeux,awayAttacks, awayDangerousAttacks, awayOnTarget, awayOffTarget, awayShotsTotal, awayShotsInsideBox, awayCorners, awayPossession);
    
        const homeCriteriaSecondHalf = evaluatePhase(tempsJeux,homeAttacks, homeDangerousAttacks, homeOnTarget,homeOffTarget, homeShotsTotal, homeShotsInsideBox, homeCorners, homePossession);
        const awayCriteriaSecondHalf = evaluatePhase(tempsJeux,awayAttacks, awayDangerousAttacks, awayOnTarget,awayOffTarget, awayShotsTotal, awayShotsInsideBox, awayCorners, awayPossession);
    
        // Retourne true si une des équipes répond aux critères dans l'une des phases
        return (
          (homeCriteriaFirstHalf || awayCriteriaFirstHalf) ||
          (homeCriteriaSecondHalf || awayCriteriaSecondHalf)
        );
      });
    }
   
    
  
    generateCoupons(matches: any[]): any[] {
      console.table(matches);
      return matches.map((match) => ({
        match_id: match.match_id,
        match_status: match.match_status,
        pays: match.country_name,
        league_name:match.league_name,
        teams: `${match.match_hometeam_name} vs ${match.match_awayteam_name}`,
        score : `${match.match_hometeam_score} : ${match.match_awayteam_score}`,
        predicted_outcome: 'But en première mi-temps',
        stat:match.statistics,
        PremiereMitemps: match?.statistics_1half
      }));
    }
  
  
}
