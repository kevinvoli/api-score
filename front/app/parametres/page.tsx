'use client';

import { useState, useEffect } from 'react';
import { useSmartRules, useUpdateSmartRules } from '../../lib/hooks/useSmartRules';
import { useTestBacktestConfig } from '../../lib/hooks/useBacktest';
import {
  DEFAULT_CONFIG, SmartRulesConfig, HalfRule, OddsConfig, ShotSignal, ScoreStateModifiers,
} from '../../lib/api/smartRules';
import { Loader } from '../../components/loader/Loader';

// ── Champ numérique inline ────────────────────────────────────
function NumInput({
  value, onChange, min = 0, max, step = 1, suffix,
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <span className="param-num-wrap">
      <input
        type="number"
        className="param-num"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span className="param-suffix">{suffix}</span>}
    </span>
  );
}

// ── Ligne règle 1ère mi-temps ─────────────────────────────────
function FirstHalfRuleRow({
  rule, index, total,
  onChange, onDelete,
}: {
  rule: HalfRule; index: number; total: number;
  onChange: (r: HalfRule) => void;
  onDelete: () => void;
}) {
  return (
    <div className="param-rule-row">
      <span className="param-rule-idx">{index + 1}</span>
      <span className="param-rule-text">Si</span>
      <span className="param-rule-text">temps de jeu</span>
      <span className="param-rule-op">&lt;</span>
      <NumInput
        value={rule.maxElapsed}
        min={1} max={45}
        suffix="min"
        onChange={(v) => onChange({ ...rule, maxElapsed: v })}
      />
      <span className="param-rule-text">et tirs</span>
      <span className="param-rule-op">≥</span>
      <NumInput
        value={rule.minShots}
        min={1} max={50}
        suffix="tirs"
        onChange={(v) => onChange({ ...rule, minShots: v })}
      />
      <span className="param-rule-arrow">→</span>
      <span className="param-rule-result">Suggérer +0.5 buts MT &amp; match</span>
      <button
        type="button"
        className="param-del-btn"
        onClick={onDelete}
        disabled={total <= 1}
        title="Supprimer cette règle"
      >
        ×
      </button>
    </div>
  );
}

// ── Bloc cotes ────────────────────────────────────────────────
// LOT A.1/A.2/A.4 : « Edge % » et « Confiance » ont disparu. Ce ne sont pas
// des valeurs calculées (voir AVIS_PRONOSTIQUEUR.md §1) : elles n'étaient
// jamais lues par le moteur de suggestions, qui calcule déjà le vrai taux de
// base par championnat (LOT 2) et l'affiche via ConfidenceValue sur les
// pages Recommandations et Coupons. Ne reste ici que la cote de référence,
// explicitement indicative, qui sert de valeur d'affichage par défaut tant
// qu'aucune cote de marché réelle n'est disponible pour le match.
function OddsBlock({
  label, value, onChange,
}: {
  label: string;
  value: OddsConfig;
  onChange: (v: OddsConfig) => void;
}) {
  return (
    <div className="param-odds-block">
      <p className="param-odds-label">{label}</p>
      <div className="param-odds-grid">
        <span className="param-odds-key">Cote de référence (indicative)</span>
        <NumInput value={value.current} min={1.01} step={0.05}
          onChange={(v) => onChange({ ...value, current: v })} />

        <span className="param-odds-key">Cote minimum</span>
        <NumInput value={value.min} min={1.01} step={0.05}
          onChange={(v) => onChange({ ...value, min: v })} />
      </div>
    </div>
  );
}

// ── Sélecteur du signal offensif ──────────────────────────────
const SIGNAL_OPTIONS: { value: ShotSignal; label: string }[] = [
  { value: 'TOTAL_SHOTS',    label: 'Total des tirs' },
  { value: 'ON_TARGET',      label: 'Tirs cadrés' },
  { value: 'PRESSURE_INDEX', label: 'Indice de pression' },
];

function SignalSelector({
  value, onChange,
}: {
  value: ShotSignal;
  onChange: (v: ShotSignal) => void;
}) {
  return (
    <div className="param-radio-group" role="radiogroup" aria-label="Signal de déclenchement">
      {SIGNAL_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`param-radio-option${value === opt.value ? ' param-radio-option--active' : ''}`}
        >
          <input
            type="radio"
            name="shot-signal"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ── Bloc modulation selon l'état au score ─────────────────────
function ScoreStateModifiersBlock({
  value, onChange,
}: {
  value: ScoreStateModifiers;
  onChange: (v: ScoreStateModifiers) => void;
}) {
  return (
    <div className="param-odds-grid">
      <span className="param-odds-key">Quand l&apos;équipe mène</span>
      <NumInput
        value={value.leading}
        min={-20} max={20}
        onChange={(v) => onChange({ ...value, leading: v })}
      />

      <span className="param-odds-key">Quand l&apos;équipe est menée</span>
      <NumInput
        value={value.trailing}
        min={-20} max={20}
        onChange={(v) => onChange({ ...value, trailing: v })}
      />

      <span className="param-odds-key">Match nul</span>
      <NumInput
        value={value.drawing}
        min={-20} max={20}
        onChange={(v) => onChange({ ...value, drawing: v })}
      />
    </div>
  );
}

// ── Panneau de résultat du backtest de test (LOT A.5) ──────────
function TestBacktestPanel({ config }: { config: SmartRulesConfig }) {
  const { mutate: runTest, data: run, isPending, error, reset } = useTestBacktestConfig();

  const kpis = run?.kpis ?? null;

  return (
    <div className="param-section">
      <h2 className="param-section-title">Tester cette configuration en backtest</h2>
      <p className="param-section-desc">
        Rejoue la configuration ci-dessus — y compris les modifications non encore
        sauvegardées — sur l&apos;historique importé, sans rien changer à la
        configuration réellement active. Utile pour voir l&apos;effet d&apos;un
        seuil avant de le valider.
      </p>

      <div className="param-backtest-actions">
        <button
          type="button"
          className="param-add-btn"
          onClick={() => { reset(); runTest(config); }}
          disabled={isPending}
        >
          {isPending ? <Loader size={14} /> : null}
          {isPending ? 'Calcul en cours…' : 'Tester cette configuration en backtest'}
        </button>
      </div>

      {error && (
        <p className="param-error">
          Le backtest a échoué : {error instanceof Error ? error.message : 'erreur inconnue'}.
        </p>
      )}

      {kpis && (
        <div className="param-backtest-result">
          <div className="param-backtest-headline">
            <div>
              <p className="param-backtest-metric-label">Hit-rate global</p>
              <strong className="param-backtest-metric-value">
                {(kpis.hitRate * 100).toFixed(1)}%
              </strong>
            </div>
            <div>
              <p className="param-backtest-metric-label">Alertes résolues</p>
              <strong className="param-backtest-metric-value">{kpis.betCount}</strong>
            </div>
          </div>

          <p className="param-backtest-note">
            Le ROI n&apos;est pas affiché ici : sans cotes de marché réelles au
            moment de la décision, il ne mesure rien d&apos;exploitable pour un
            scanner (voir AVIS_PRONOSTIQUEUR.md). Seuls le hit-rate et le volume
            comptent pour régler ces règles.
          </p>

          <div className="param-backtest-markets">
            {Object.entries(kpis.yieldByMarket).map(([market, stats]) => (
              <div key={market} className="param-backtest-market-row">
                <span className="param-backtest-market-name">{market}</span>
                <span className="param-backtest-market-stat">
                  {(stats.hitRate * 100).toFixed(1)}% sur {stats.bets} alerte{stats.bets > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>

          {kpis.betCount < 500 && (
            <p className="param-backtest-note param-backtest-note--warn">
              Échantillon de {kpis.betCount} alertes résolues : en dessous de 500 à
              1 000, ces chiffres ne permettent pas de distinguer un réglage
              réellement meilleur du simple hasard.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────
export default function ParametresPage() {
  const { data: remote, isLoading, error } = useSmartRules();
  const { mutate: save, isPending: isSaving, isSuccess: saved } = useUpdateSmartRules();

  const [config, setConfig] = useState<SmartRulesConfig>(DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);

  // Initialiser depuis le serveur dès que les données arrivent
  useEffect(() => {
    if (remote) { setConfig(remote); setDirty(false); }
  }, [remote]);

  const update = (next: SmartRulesConfig) => { setConfig(next); setDirty(true); };

  const setFirstHalfRule = (idx: number, rule: HalfRule) =>
    update({
      ...config,
      firstHalfRules: config.firstHalfRules.map((r, i) => (i === idx ? rule : r)),
    });

  const deleteFirstHalfRule = (idx: number) =>
    update({
      ...config,
      firstHalfRules: config.firstHalfRules.filter((_, i) => i !== idx),
    });

  const addFirstHalfRule = () => {
    const last = config.firstHalfRules[config.firstHalfRules.length - 1];
    update({
      ...config,
      firstHalfRules: [
        ...config.firstHalfRules,
        { maxElapsed: Math.min(45, (last?.maxElapsed ?? 10) + 10), minShots: (last?.minShots ?? 5) + 3 },
      ],
    });
  };

  const reset = () => { setConfig(remote ?? DEFAULT_CONFIG); setDirty(false); };

  const signal = config.signal ?? 'TOTAL_SHOTS';
  const scoreStateModifiers = config.scoreStateModifiers ?? { leading: 0, trailing: 0, drawing: 0 };

  return (
    <section className="content">
      <div className="hero">
        <p className="eyebrow">Paramètres</p>
        <h1>Critères de sélection</h1>
        <p className="lead">
          Ajuste les règles qui déterminent quels matchs et options sont suggérés automatiquement.
        </p>
      </div>

      {isLoading && <Loader size={24} label="Chargement de la configuration…" centered />}
      {error && <p className="param-error">Impossible de charger la configuration backend.</p>}

      {!isLoading && !error && (
        <div className="param-page">

          {/* ── Section 1ère mi-temps ── */}
          <div className="param-section">
            <div className="param-section-header">
              <div>
                <h2 className="param-section-title">Règles — 1ère mi-temps</h2>
                <p className="param-section-desc">
                  Progressives : chaque règle définit une fenêtre de temps et un seuil de tirs minimum.
                  Si une équipe remplit l&apos;une des conditions, deux suggestions sont générées.
                </p>
              </div>
              <button type="button" className="param-add-btn" onClick={addFirstHalfRule}>
                + Ajouter une règle
              </button>
            </div>

            <div className="param-rule-list">
              {config.firstHalfRules.map((rule, idx) => (
                <FirstHalfRuleRow
                  key={idx}
                  rule={rule}
                  index={idx}
                  total={config.firstHalfRules.length}
                  onChange={(r) => setFirstHalfRule(idx, r)}
                  onDelete={() => deleteFirstHalfRule(idx)}
                />
              ))}
            </div>

            <div className="param-rule-preview">
              <span className="param-preview-label">Récapitulatif :</span>
              {config.firstHalfRules.map((r, i) => (
                <span key={i} className="param-preview-tag">
                  &lt;{r.maxElapsed}&apos; · ≥{r.minShots} tirs
                </span>
              ))}
            </div>
          </div>

          {/* ── Section 2ème mi-temps ── */}
          <div className="param-section">
            <h2 className="param-section-title">Règle — 2ème mi-temps</h2>
            <p className="param-section-desc">
              Si une équipe atteint le seuil de tirs avant la minute définie en 2ème mi-temps,
              une suggestion &laquo; marque en 2ème MT &raquo; est générée.
            </p>

            <div className="param-rule-row param-rule-row--single">
              <span className="param-rule-text">Si</span>
              <span className="param-rule-text">temps de jeu</span>
              <span className="param-rule-op">&lt;</span>
              <NumInput
                value={config.secondHalfRule.maxElapsed}
                min={46} max={90}
                suffix="min"
                onChange={(v) => update({ ...config, secondHalfRule: { ...config.secondHalfRule, maxElapsed: v } })}
              />
              <span className="param-rule-text">et tirs</span>
              <span className="param-rule-op">≥</span>
              <NumInput
                value={config.secondHalfRule.minShots}
                min={1} max={50}
                suffix="tirs"
                onChange={(v) => update({ ...config, secondHalfRule: { ...config.secondHalfRule, minShots: v } })}
              />
              <span className="param-rule-arrow">→</span>
              <span className="param-rule-result">Suggérer +0.5 buts 2ème MT</span>
            </div>
          </div>

          {/* ── Section Cote de référence ── */}
          <div className="param-section">
            <h2 className="param-section-title">Cote de référence</h2>
            <p className="param-section-desc">
              Valeur d&apos;affichage par défaut, utilisée uniquement quand aucune cote de
              marché réelle n&apos;est disponible pour le match. Le taux de confiance réel
              (LOT 2, calculé par championnat sur l&apos;historique) ne se règle pas ici :
              il s&apos;affiche automatiquement, avec sa taille d&apos;échantillon, sur les
              pages Recommandations et Coupons.
            </p>
            <div className="param-odds-grid-outer">
              <OddsBlock
                label="+0.5 buts avant la mi-temps"
                value={config.odds.firstHalfHT}
                onChange={(v) => update({ ...config, odds: { ...config.odds, firstHalfHT: v } })}
              />
              <OddsBlock
                label="+0.5 buts dans le match"
                value={config.odds.firstHalfFT}
                onChange={(v) => update({ ...config, odds: { ...config.odds, firstHalfFT: v } })}
              />
              <OddsBlock
                label="+0.5 buts en 2ème mi-temps"
                value={config.odds.secondHalf}
                onChange={(v) => update({ ...config, odds: { ...config.odds, secondHalf: v } })}
              />
            </div>
          </div>

          {/* ── Section Signal de déclenchement ── */}
          <div className="param-section">
            <h2 className="param-section-title">Signal de déclenchement</h2>
            <p className="param-section-desc">
              Métrique comparée aux seuils de tirs des règles.
            </p>
            <SignalSelector
              value={signal}
              onChange={(v) => update({ ...config, signal: v })}
            />
          </div>

          {/* ── Section Modulation selon l'état au score ── */}
          <div className="param-section">
            <h2 className="param-section-title">Modulation selon l&apos;état au score</h2>
            <p className="param-section-desc">
              Ajusté au seuil de tirs : négatif = alerte plus tôt (équipe menée qui pousse),
              positif = plus exigeant.
            </p>
            <ScoreStateModifiersBlock
              value={scoreStateModifiers}
              onChange={(v) => update({ ...config, scoreStateModifiers: v })}
            />
          </div>

          {/* ── Section Tester en backtest (LOT A.5) ── */}
          <TestBacktestPanel config={config} />

          {/* ── Barre d'actions ── */}
          <div className="param-action-bar">
            {saved && !dirty && (
              <span className="param-saved-badge">✓ Configuration sauvegardée</span>
            )}
            <button
              type="button"
              className="param-reset-btn"
              onClick={reset}
              disabled={!dirty}
            >
              Annuler
            </button>
            <button
              type="button"
              className="param-save-btn"
              onClick={() => save(config)}
              disabled={!dirty || isSaving}
            >
              {isSaving ? <Loader size={14} /> : null}
              {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
