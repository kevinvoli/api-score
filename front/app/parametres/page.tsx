'use client';

import { useState, useEffect } from 'react';
import { useSmartRules, useUpdateSmartRules } from '../../lib/hooks/useSmartRules';
import { DEFAULT_CONFIG, SmartRulesConfig, HalfRule, OddsConfig } from '../../lib/api/smartRules';
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
        <span className="param-odds-key">Cote actuelle</span>
        <NumInput value={value.current} min={1.01} step={0.05}
          onChange={(v) => onChange({ ...value, current: v })} />

        <span className="param-odds-key">Cote minimum</span>
        <NumInput value={value.min} min={1.01} step={0.05}
          onChange={(v) => onChange({ ...value, min: v })} />

        <span className="param-odds-key">Edge %</span>
        <NumInput value={value.edgePct} min={0} max={100} step={0.5} suffix="%"
          onChange={(v) => onChange({ ...value, edgePct: v })} />

        <span className="param-odds-key">Confiance</span>
        <NumInput value={value.confidence} min={0} max={100} suffix="%"
          onChange={(v) => onChange({ ...value, confidence: v })} />
      </div>
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

          {/* ── Section Cotes & Confiance ── */}
          <div className="param-section">
            <h2 className="param-section-title">Cotes &amp; Confiance</h2>
            <p className="param-section-desc">
              Valeurs par défaut appliquées à chaque suggestion générée par les règles.
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
