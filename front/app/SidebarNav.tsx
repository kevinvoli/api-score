'use client';

import { usePathname } from 'next/navigation';
import { useProviderExplorer } from '../lib/providerExplorerContext';

const links = [
  { href: '/live', label: 'Live' },
  { href: '/recommendations', label: 'Recommandations' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/analytics', label: 'Analyse' },
  { href: '/audit', label: 'Audit' },
];

export default function SidebarNav() {
  const pathname = usePathname();
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
    <>
      <nav className="sidebar-nav">
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href === '/recommendations' && pathname === '/');
          return (
            <a
              key={link.href}
              className={`sidebar-link${isActive ? ' active' : ''}`}
              href={link.href}
            >
              {link.label}
            </a>
          );
        })}
      </nav>

      <section className="sidebar-panel">
        <h4>Champions</h4>
        <div className="sidebar-panel-body">
          <div className="sidebar-block">
            <p className="sidebar-block-title">Pays</p>
            {countriesLoading && <p className="sidebar-empty">Chargement...</p>}
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
            {!countriesLoading && !countries.length && <p className="sidebar-empty">Aucun pays</p>}
          </div>

          <div className="sidebar-block">
            <p className="sidebar-block-title">Championnats</p>
            {leaguesLoading && <p className="sidebar-empty">Chargement...</p>}
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
    </>
  );
}
