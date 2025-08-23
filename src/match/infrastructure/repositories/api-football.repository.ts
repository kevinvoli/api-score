import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Match } from "src/match/domain/entities/match.entity";
import { MatchRepository } from "src/match/domain/repositories/match.repository";

@Injectable()
export class ApiFootballRepository implements MatchRepository {
    private readonly apiKey: string;

    constructor(private readonly configService: ConfigService) {
        this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY');
    }

    async getLiveMatches(): Promise<Match[]> {
        const url = `https://apiv3.apifootball.com/?action=get_events&APIkey=${this.apiKey}&match_live=1`
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

            if (!Array.isArray(matches)) {
                throw new Error("Les données reçues ne sont pas un tableau de matchs.");
            }

            const validMatches = matches.filter((match: any) => {
                return Array.isArray(match?.statistics) && match?.statistics.length > 0 && match?.match_status !== "Finished";
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
}
