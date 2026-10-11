import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExecutionControlLedger20261002130000
  implements MigrationInterface
{
  name = 'CreateExecutionControlLedger20261002130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE risk_policies (
        id char(36) NOT NULL,
        version int NOT NULL,
        currency char(3) NOT NULL,
        max_stake_per_bet decimal(14,2) NOT NULL,
        max_daily_stake decimal(14,2) NOT NULL,
        max_daily_loss decimal(14,2) NOT NULL,
        max_open_exposure decimal(14,2) NOT NULL,
        max_quote_age_ms int NOT NULL,
        created_by_user_id char(36) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_risk_policies_version (version),
        CONSTRAINT chk_risk_policies_positive CHECK (
          max_stake_per_bet > 0 AND max_daily_stake > 0 AND max_daily_loss > 0
          AND max_open_exposure > 0 AND max_quote_age_ms > 0
        ),
        CONSTRAINT chk_risk_policies_coherent CHECK (
          max_stake_per_bet <= max_daily_stake AND max_stake_per_bet <= max_open_exposure
        )
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE execution_controls (
        id char(36) NOT NULL,
        scope varchar(20) NOT NULL,
        mode varchar(20) NOT NULL,
        version bigint NOT NULL,
        active_risk_policy_id char(36) NULL,
        stop_reason varchar(500) NULL,
        stop_source varchar(20) NULL,
        changed_by_user_id char(36) NULL,
        changed_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_execution_controls_scope (scope),
        CONSTRAINT fk_execution_controls_risk_policy FOREIGN KEY (active_risk_policy_id)
          REFERENCES risk_policies (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_execution_controls_version CHECK (version >= 1)
      ) ENGINE=InnoDB;
    `);

    // L'état initial ne dépend d'aucune variable d'environnement : exécution arrêtée.
    await queryRunner.query(`
      INSERT INTO execution_controls (id, scope, mode, version, stop_reason, stop_source, changed_at)
      VALUES (UUID(), 'GLOBAL', 'DISABLED', 1,
              'Initialisation : exécution désactivée par défaut', 'BOOTSTRAP', CURRENT_TIMESTAMP(6))
    `);

    await queryRunner.query(`
      CREATE TABLE execution_gate_evidence (
        id char(36) NOT NULL,
        control_id char(36) NOT NULL,
        gate_key varchar(10) NOT NULL,
        period_from datetime(3) NOT NULL,
        period_to datetime(3) NOT NULL,
        metrics json NOT NULL,
        report_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        verdict varchar(10) NOT NULL,
        approved_by_user_id char(36) NOT NULL,
        approved_at datetime(6) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_execution_gate_evidence_gate_report (gate_key, report_hash),
        KEY idx_execution_gate_evidence_control (control_id, gate_key),
        CONSTRAINT fk_execution_gate_evidence_control FOREIGN KEY (control_id)
          REFERENCES execution_controls (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_execution_gate_evidence_period CHECK (period_from < period_to)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE bankroll_accounts (
        id char(36) NOT NULL,
        mode varchar(20) NOT NULL,
        operator_key varchar(40) NOT NULL,
        currency char(3) NOT NULL,
        available_balance decimal(14,2) NOT NULL,
        reserved_balance decimal(14,2) NOT NULL,
        version bigint NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_bankroll_accounts_mode_operator_currency (mode, operator_key, currency),
        CONSTRAINT chk_bankroll_accounts_non_negative CHECK (available_balance >= 0 AND reserved_balance >= 0)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE bankroll_ledger_entries (
        id char(36) NOT NULL,
        account_id char(36) NOT NULL,
        order_id char(36) NULL,
        entry_key varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        entry_type varchar(20) NOT NULL,
        amount decimal(14,2) NOT NULL,
        reserved_delta decimal(14,2) NOT NULL,
        available_after decimal(14,2) NOT NULL,
        reserved_after decimal(14,2) NOT NULL,
        currency char(3) NOT NULL,
        account_version bigint NOT NULL,
        actor_user_id char(36) NULL,
        metadata json NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_bankroll_ledger_entries_entry_key (entry_key),
        UNIQUE KEY uq_bankroll_ledger_entries_account_version (account_id, account_version),
        KEY idx_bankroll_ledger_entries_account_created (account_id, created_at, id),
        CONSTRAINT fk_bankroll_ledger_entries_account FOREIGN KEY (account_id)
          REFERENCES bankroll_accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_bankroll_ledger_entries_after CHECK (available_after >= 0 AND reserved_after >= 0)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bankroll_ledger_entries');
    await queryRunner.query('DROP TABLE bankroll_accounts');
    await queryRunner.query('DROP TABLE execution_gate_evidence');
    await queryRunner.query('DROP TABLE execution_controls');
    await queryRunner.query('DROP TABLE risk_policies');
  }
}
