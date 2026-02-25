'use client';

import { useProviderExplorer } from '../../lib/providerExplorerContext';

export function NavbarChampions() {
  const {
    countries,
    leagues,
    selectedCountryId,
    selectedLeagueId,
    setSelectedCountryId,
    setSelectedLeagueId,
    countriesLoading,
    leaguesLoading,
  } = useProviderExplorer();

  return (
    <div className="navbar-champions">
      <div className="navbar-champ-group">
        <span className="navbar-champ-label">Pays</span>
        <div className="navbar-champ-select">
          {countriesLoading && <span className="navbar-champ-placeholder">Chargement...</span>}
          {!countriesLoading && !selectedCountryId && (
            <span className="navbar-champ-placeholder">Sélectionner</span>
          )}
          {!countriesLoading && selectedCountryId && (
            <span className="navbar-champ-value">
              {countries.find((c) => c.country_id === selectedCountryId)?.country_name ?? '—'}
            </span>
          )}
          <select
            className="navbar-champ-native"
            value={selectedCountryId ?? ''}
            onChange={(e) => setSelectedCountryId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Sélectionner un pays"
          >
            <option value="">Pays</option>
            {countries.map((c) => (
              <option key={c.country_id} value={c.country_id}>
                {c.country_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <span className="navbar-champ-sep">/</span>

      <div className="navbar-champ-group">
        <span className="navbar-champ-label">Championnat</span>
        <div className="navbar-champ-select">
          {leaguesLoading && <span className="navbar-champ-placeholder">Chargement...</span>}
          {!leaguesLoading && !selectedLeagueId && (
            <span className="navbar-champ-placeholder">
              {selectedCountryId ? 'Sélectionner' : '—'}
            </span>
          )}
          {!leaguesLoading && selectedLeagueId && (
            <span className="navbar-champ-value">
              {leagues.find((l) => l.league_id === selectedLeagueId)?.league_name ?? '—'}
            </span>
          )}
          <select
            className="navbar-champ-native"
            value={selectedLeagueId ?? ''}
            onChange={(e) => setSelectedLeagueId(e.target.value ? Number(e.target.value) : null)}
            disabled={!selectedCountryId}
            aria-label="Sélectionner un championnat"
          >
            <option value="">Championnat</option>
            {leagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.league_name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
