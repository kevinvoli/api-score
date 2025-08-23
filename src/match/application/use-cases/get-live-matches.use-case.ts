import { Inject, Injectable } from "@nestjs/common";
import { Match } from "src/match/domain/entities/match.entity";
import { MatchRepository } from "src/match/domain/repositories/match.repository";
import { MATCH_REPOSITORY } from "src/match/domain/repositories/match.repository.token";

@Injectable()
export class GetLiveMatchesUseCase {
    constructor(
        @Inject(MATCH_REPOSITORY)
        private readonly matchRepository: MatchRepository
    ) { }

    async execute(): Promise<any[]> {
        const matches = await this.matchRepository.getLiveMatches();
        const filteredMatches = this.filterMatches(matches);
        return this.generateCoupons(filteredMatches);
    }

    private filterMatches(matches: Match[]): Match[] {
        return matches.filter((match) => {
            const stats = match.statistics;
            const statsMiTemps = match.statistics_1half
            let tempsJeux;
            if (match?.match_status != "Finished" && match?.match_status != "Half Time") {
                tempsJeux = parseInt(match.match_status.split(':')[0], 10)
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
            const homePossession = ballPossession && ballPossession.home ? parseInt(ballPossession.home.replace('%', '')) : 0;
            const awayPossession = ballPossession && ballPossession.away ? parseInt(ballPossession.away.replace('%', '')) : 0;

            // Convertir les valeurs en nombre pour comparaison premiere mi-tamps

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
            const homePossession1 = ballPossession && ballPossession.home ? parseInt(ballPossession.home.replace('%', '')) : 0;
            const awayPossession1 = ballPossession && ballPossession.away ? parseInt(ballPossession.away.replace('%', '')) : 0;


            // Définir les critères pour chaque mi-temps, divisés en 2 parties de 22 minutes
            const evaluatePhase = (tempsJeux, attacks: number, dangerousAttacks: number, onTarget: number, offTarget: number, shotsTotal: number, shotsInsideBox: number, corners: number, possession: number) => {
                const tir = onTarget + offTarget

                if (tempsJeux != "Finished" && tempsJeux != "Half Time") {

                    if (parseInt(tempsJeux) > 0 && parseInt(tempsJeux) <= 10) {
                        return (
                            attacks > 5 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.3 &&  // au moins 40% des attaques sont dangereuse
                            onTarget >= 0 &&  // au moins 2 tirs cadrés
                            tir >= 4
                        );
                    } else if (parseInt(tempsJeux) > 10 && parseInt(tempsJeux) < 16) {

                        return (
                            attacks > 6 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.3 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 2 &&  // au moins 2 tirs cadrés
                            tir >= 5
                        );
                    } else if (parseInt(tempsJeux) > 16 && parseInt(tempsJeux) < 23) {

                        return (
                            attacks > 15 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 2 &&  // au moins 2 tirs cadrés
                            tir >= 7
                        );
                    } else if (parseInt(tempsJeux) > 23 && parseInt(tempsJeux) < 35) {

                        return (
                            attacks > 20 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 3 &&  // au moins 2 tirs cadrés
                            tir >= 8
                        );
                    } else if (parseInt(tempsJeux) > 35 && parseInt(tempsJeux) < 45) {


                        return (
                            attacks > 30 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 4 &&  // au moins 2 tirs cadrés
                            tir >= 10
                        );
                    } else if (parseInt(tempsJeux) > 45 && parseInt(tempsJeux) < 55) {
                        return (
                            attacks > 40 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 4 && // au moins 2 tirs cadrés
                            tir > 13
                        );
                    } else if (parseInt(tempsJeux) > 55 && parseInt(tempsJeux) < 66) {
                        return (
                            attacks > 40 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 4 && // au moins 2 tirs cadrés
                            tir > 15
                        );
                    } else if (parseInt(tempsJeux) > 66 && parseInt(tempsJeux) < 78) {
                        return (
                            attacks > 50 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 5 && // au moins 2 tirs cadrés
                            tir > 17
                        );
                    } else if (parseInt(tempsJeux) > 78 && parseInt(tempsJeux) < 90) {
                        return (
                            attacks > 70 &&  // minimum 10 attaques
                            dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                            onTarget >= 7 &&  // au moins 2 tirs cadrés
                            tir > 22
                        );
                    }
                } if (tempsJeux === "Finished") {
                    return false
                } else if (tempsJeux === "Half Time") {
                    console.log("la mi-temps", (attacks > 30 &&  // minimum 10 attaques
                        dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                        onTarget >= 3 &&  // au moins 2 tirs cadrés
                        tir > 13));
                    return (
                        attacks > 30 &&  // minimum 10 attaques
                        dangerousAttacks >= attacks * 0.4 &&  // au moins 40% des attaques sont dangereuses
                        onTarget >= 3 &&  // au moins 2 tirs cadrés
                        tir > 12
                    );
                }


            };

            // Diviser les critères en 2 parties de mi-temps
            const homeCriteriaFirstHalf = evaluatePhase(tempsJeux, homeAttacks, homeDangerousAttacks, homeOnTarget, homeOffTarget, homeShotsTotal, homeShotsInsideBox, homeCorners, homePossession);
            const awayCriteriaFirstHalf = evaluatePhase(tempsJeux, awayAttacks, awayDangerousAttacks, awayOnTarget, awayOffTarget, awayShotsTotal, awayShotsInsideBox, awayCorners, awayPossession);

            const homeCriteriaSecondHalf = evaluatePhase(tempsJeux, homeAttacks, homeDangerousAttacks, homeOnTarget, homeOffTarget, homeShotsTotal, homeShotsInsideBox, homeCorners, homePossession);
            const awayCriteriaSecondHalf = evaluatePhase(tempsJeux, awayAttacks, awayDangerousAttacks, awayOnTarget, awayOffTarget, awayShotsTotal, awayShotsInsideBox, awayCorners, awayPossession);

            // Retourne true si une des équipes répond aux critères dans l'une des phases
            return (
                (homeCriteriaFirstHalf || awayCriteriaFirstHalf) ||
                (homeCriteriaSecondHalf || awayCriteriaSecondHalf)
            );
        });
    }

    private generateCoupons(matches: Match[]): any[] {
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
            PremiereMitemps: match?.statistics_1half
        }));
    }
}
