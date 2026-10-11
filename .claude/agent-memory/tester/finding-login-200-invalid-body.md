---
name: finding-login-200-invalid-body
description: front/app/api/auth/login/route.ts peut renvoyer HTTP 200 avec un corps {error:...} si le backend répond 200 mais avec une structure invalide — bug non corrigé, pas encore testé.
metadata:
  type: project
---

Dans `front/app/api/auth/login/route.ts`, quand le backend répond avec le statut 200 mais un corps qui ne
respecte pas `isLoginBackendResponse` (JSON malformé ou champs manquants), `normalizeBackendError(200,
parsedBody)` est appelé avec le statut original. Comme 200 n'est pas dans `PASSTHROUGH_STATUSES` et n'est
pas `>= 500`, le code tombe dans le cas par défaut et renvoie **`{ status: 200, error: 'Requête invalide' }`**
— un succès HTTP avec un corps d'erreur, ce qui est contradictoire pour un client qui se fie au statut.

**Why** : repéré lors de l'audit de couverture du lot 2 (tâche tester, 2026-10-04) en analysant
`normalizeBackendError` dans `lib/server/backend-client.ts` pour couvrir l'item « réponse backend invalide
→ 502 normalisé ». Le test n'a pas été écrit (aurait échoué sans changer le code applicatif, hors périmètre
du lot `tester`) — remonté comme finding à `team-lead`/`reviewer` au lieu d'être corrigé.

**How to apply** : si ce chantier revient (lot 2 BFF ou une review de `backend-client.ts`), vérifier si ce
cas a été corrigé (devrait probablement renvoyer 502, pas 200) avant de considérer l'item « réponse backend
invalide/401/403 → statut conservé / 502 normalisé » comme pleinement couvert. Si corrigé, ajouter le test
manquant dans `front/app/api/auth/login/route.test.ts`.
