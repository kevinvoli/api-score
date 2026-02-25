'use client';

import { useProviderExplorer } from '../../lib/providerExplorerContext';
import { Loader } from '../loader/Loader';

export function SidebarChampions() {
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
    <section className="sidebar-panel">
      <h4>Champions</h4>
      <div className="sidebar-panel-body">
        <div className="sidebar-block">
          <p className="sidebar-block-title">Pays</p>
          {countriesLoading && <Loader size={16} label="Chargement..." />}
          {!countriesLoading &&
            countries.map((country) => (
              <button
                key={country.country_id}
                type="button"
                className={`sidebar-item${selectedCountryId === country.country_id ? ' active' : ''}`}
                onClick={() => setSelectedCountryId(country.country_id)}
              >
                {country.country_logo && (
                  <img src={country.country_logo} alt="" className="sidebar-flag" />
                )}
                <span>{country.country_name}</span>
              </button>
            ))}
          {!countriesLoading && !countries.length && (
            <p className="sidebar-empty">Aucun pays</p>
          )}
        </div>

        <div className="sidebar-block">
          <p className="sidebar-block-title">Championnats</p>
          {leaguesLoading && <Loader size={16} label="Chargement..." />}
          {!leaguesLoading &&
            leagues.map((league) => (
              <button
                key={league.league_id}
                type="button"
                className={`sidebar-item${selectedLeagueId === league.league_id ? ' active' : ''}`}
                onClick={() => setSelectedLeagueId(league.league_id)}
              >
                <span>{league.league_name}</span>
                {league.season && <small>{league.season}</small>}
              </button>
            ))}
          {!leaguesLoading && !leagues.length && (
            <p className="sidebar-empty">
              Sélectionne un pays pour charger les championnats
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
