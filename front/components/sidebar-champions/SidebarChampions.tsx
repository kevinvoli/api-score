'use client';

import { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useProviderCountries } from '../../lib/hooks/useProviderData';
import { fetchProviderLeagues } from '../../lib/api/provider';
import { useProviderExplorer } from '../../lib/providerExplorerContext';
import { Loader } from '../loader/Loader';
import type { ProviderCountry } from '../../lib/api/provider';

// ── Leagues for one country ───────────────────────────────────
const LeagueList = memo(function LeagueList({
  countryId,
  selectedLeagueId,
  onSelect,
}: {
  countryId: number;
  selectedLeagueId: number | null;
  onSelect: (leagueId: number, countryId: number) => void;
}) {
  const { data: leagues = [], isLoading } = useQuery({
    queryKey: ['provider', 'leagues', countryId],
    queryFn: () => fetchProviderLeagues(countryId),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="sacc-leaf-loading">
        <Loader size={12} centered />
      </div>
    );
  }
  if (!leagues.length) {
    return <p className="sacc-leaf-empty">Aucun championnat</p>;
  }

  return (
    <div className="sacc-leagues">
      {leagues.map((league) => (
        <button
          key={league.league_id}
          type="button"
          className={`sacc-league-btn${selectedLeagueId === league.league_id ? ' active' : ''}`}
          onClick={() => onSelect(league.league_id, countryId)}
        >
          {league.league_logo && (
            <img src={league.league_logo} alt="" className="sacc-league-logo" />
          )}
          <span className="sacc-league-name">{league.league_name}</span>
          {league.season && <small className="sacc-league-season">{league.season}</small>}
        </button>
      ))}
    </div>
  );
});

// ── Country row with its own expand state ─────────────────────
function CountryRow({
  country,
  selectedLeagueId,
  onSelectLeague,
}: {
  country: ProviderCountry;
  selectedLeagueId: number | null;
  onSelectLeague: (leagueId: number, countryId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sacc-country">
      <button
        type="button"
        className={`sacc-country-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {country.country_logo ? (
          <img src={country.country_logo} alt="" className="sacc-flag" />
        ) : (
          <span className="sacc-flag-placeholder" />
        )}
        <span className="sacc-country-name">{country.country_name}</span>
        <span className={`sacc-chevron${open ? ' open' : ''}`}>›</span>
      </button>

      {open && (
        <LeagueList
          countryId={country.country_id}
          selectedLeagueId={selectedLeagueId}
          onSelect={onSelectLeague}
        />
      )}
    </div>
  );
}

// ── Main sidebar component ────────────────────────────────────
export function SidebarChampions() {
  const { data: countries = [], isLoading } = useProviderCountries();
  const { selectedLeagueId, setSelectedLeagueId, setSelectedCountryId } = useProviderExplorer();
  const router = useRouter();

  // State: which continents are expanded
  const [openContinents, setOpenContinents] = useState<Set<string>>(new Set());

  // Group flat list into continents.
  // Entries without country_logo are continent headers from the API.
  const groups = useMemo(() => {
    const result: Array<{ continent: string; countries: ProviderCountry[] }> = [];
    let current: (typeof result)[0] | null = null;

    for (const c of countries) {
      if (!c.country_logo) {
        // This entry is a continent / region header
        current = { continent: c.country_name, countries: [] };
        result.push(current);
      } else {
        if (!current) {
          current = { continent: 'Autres', countries: [] };
          result.push(current);
        }
        current.countries.push(c);
      }
    }
    return result;
  }, [countries]);

  const toggleContinent = (name: string) => {
    setOpenContinents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSelectLeague = (leagueId: number, countryId: number) => {
    setSelectedCountryId(countryId);
    setSelectedLeagueId(leagueId);
    // Naviguer vers la page championnats pour afficher les matchs
    router.push('/championnats');
  };

  return (
    <section className="sidebar-panel sidebar-panel--stretch">
      <h4>Champions</h4>

      <div className="sacc-root">
        {isLoading && <Loader size={16} label="Chargement..." />}

        {!isLoading && groups.length === 0 && (
          <p className="sidebar-empty">Aucun pays disponible.</p>
        )}

        {groups.map((group) => {
          const isOpen = openContinents.has(group.continent);
          return (
            <div key={group.continent} className="sacc-continent">
              <button
                type="button"
                className={`sacc-continent-btn${isOpen ? ' open' : ''}`}
                onClick={() => toggleContinent(group.continent)}
              >
                <span className={`sacc-chevron${isOpen ? ' open' : ''}`}>›</span>
                <span className="sacc-continent-name">{group.continent}</span>
                <small className="sacc-continent-count">{group.countries.length}</small>
              </button>

              {isOpen && (
                <div className="sacc-countries">
                  {group.countries.map((country) => (
                    <CountryRow
                      key={country.country_id}
                      country={country}
                      selectedLeagueId={selectedLeagueId}
                      onSelectLeague={handleSelectLeague}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
