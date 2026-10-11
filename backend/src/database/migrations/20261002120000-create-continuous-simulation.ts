import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContinuousSimulation20261002120000
  implements MigrationInterface
{
  name = 'CreateContinuousSimulation20261002120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE simulation_runs (
        id char(36) NOT NULL,
        idempotency_key varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        name varchar(120) NOT NULL,
        strategy_version varchar(40) NOT NULL,
        strategy_snapshot json NOT NULL,
        risk_snapshot json NOT NULL,
        config_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        currency char(3) NOT NULL,
        initial_bankroll decimal(14,2) NOT NULL,
        status varchar(20) NOT NULL,
        requested_by_user_id char(36) NULL,
        started_at datetime(3) NOT NULL,
        stopped_at datetime(3) NULL,
        last_tick_at datetime(3) NULL,
        created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_simulation_runs_idempotency_key (idempotency_key),
        KEY idx_simulation_runs_status (status),
        CONSTRAINT chk_simulation_runs_bankroll CHECK (initial_bankroll > 0)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE bet_decisions (
        id char(36) NOT NULL,
        simulation_run_id char(36) NOT NULL,
        signal_key char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        idempotency_key char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        fixture_id char(36) NOT NULL,
        provider_fixture_id bigint NOT NULL,
        team_id int NULL,
        is_home_team tinyint NOT NULL,
        market_type varchar(80) NOT NULL,
        market_key varchar(80) NOT NULL,
        selection_key varchar(80) NOT NULL,
        selection varchar(255) NOT NULL,
        rule_name varchar(80) NOT NULL,
        elapsed_at_decision int NULL,
        min_acceptable_odd decimal(8,3) NOT NULL,
        status varchar(20) NOT NULL,
        rejection_code varchar(40) NULL,
        decided_at datetime(3) NOT NULL,
        currency char(3) NOT NULL,
        stake decimal(14,2) NULL,
        decision_odds_snapshot_id char(36) NULL,
        decision_odd decimal(8,3) NULL,
        decision_provider_key varchar(40) NULL,
        decision_bookmaker_key varchar(160) NULL,
        decision_observed_at datetime(3) NULL,
        decision_received_at datetime(3) NULL,
        execution_due_at datetime(3) NULL,
        executable_odds_snapshot_id char(36) NULL,
        executable_odd decimal(8,3) NULL,
        executable_observed_at datetime(3) NULL,
        executable_received_at datetime(3) NULL,
        slippage_pct decimal(9,4) NULL,
        executed_at datetime(3) NULL,
        outcome varchar(20) NULL,
        profit decimal(14,2) NULL,
        settled_at datetime(3) NULL,
        created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_bet_decisions_idempotency_key (idempotency_key),
        KEY idx_bet_decisions_run_decided (simulation_run_id, decided_at, id),
        KEY idx_bet_decisions_run_status (simulation_run_id, status),
        KEY idx_bet_decisions_run_signal (simulation_run_id, signal_key),
        CONSTRAINT fk_bet_decisions_simulation_run_id FOREIGN KEY (simulation_run_id)
          REFERENCES simulation_runs (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT fk_bet_decisions_decision_odds_snapshot FOREIGN KEY (decision_odds_snapshot_id)
          REFERENCES odds_snapshots (id) ON DELETE SET NULL ON UPDATE RESTRICT,
        CONSTRAINT fk_bet_decisions_executable_odds_snapshot FOREIGN KEY (executable_odds_snapshot_id)
          REFERENCES odds_snapshots (id) ON DELETE SET NULL ON UPDATE RESTRICT,
        CONSTRAINT chk_bet_decisions_stake CHECK (stake IS NULL OR stake >= 0),
        CONSTRAINT chk_bet_decisions_rejection CHECK (
          (status = 'REJECTED') = (rejection_code IS NOT NULL)
        ),
        CONSTRAINT chk_bet_decisions_reserved_has_quote CHECK (
          status NOT IN ('ORDER_RESERVED', 'COMPLETED')
          OR (decision_odd IS NOT NULL AND stake IS NOT NULL AND stake > 0)
        ),
        CONSTRAINT chk_bet_decisions_completed CHECK (
          status <> 'COMPLETED'
          OR (outcome IS NOT NULL AND profit IS NOT NULL AND settled_at IS NOT NULL
              AND executable_odd IS NOT NULL)
        )
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE bet_decisions');
    await queryRunner.query('DROP TABLE simulation_runs');
  }
}
