import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersReconciliation20261002140000
  implements MigrationInterface
{
  name = 'CreateOrdersReconciliation20261002140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE bet_orders (
        id char(36) NOT NULL,
        decision_id char(36) NOT NULL,
        account_id char(36) NOT NULL,
        mode varchar(20) NOT NULL,
        operator_key varchar(40) NOT NULL,
        idempotency_key char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        external_order_id varchar(128) NULL,
        status varchar(30) NOT NULL,
        rejection_code varchar(40) NULL,
        status_reason varchar(255) NULL,
        fixture_id char(36) NOT NULL,
        provider_fixture_id bigint NOT NULL,
        market_key varchar(80) NOT NULL,
        selection_key varchar(80) NOT NULL,
        currency char(3) NOT NULL,
        requested_stake decimal(14,2) NOT NULL,
        requested_odd decimal(8,3) NOT NULL,
        minimum_odd decimal(8,3) NOT NULL,
        quote_captured_at datetime(3) NOT NULL,
        accepted_odd decimal(8,3) NULL,
        accepted_stake decimal(14,2) NULL,
        accepted_at datetime(3) NULL,
        payout decimal(14,2) NULL,
        submitted_at datetime(3) NULL,
        unknown_since datetime(3) NULL,
        settled_at datetime(3) NULL,
        version bigint NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_bet_orders_idempotency_key (idempotency_key),
        UNIQUE KEY uq_bet_orders_decision (decision_id),
        UNIQUE KEY uq_bet_orders_external_order_id (operator_key, external_order_id),
        KEY idx_bet_orders_account_created (account_id, created_at, id),
        KEY idx_bet_orders_status_updated (status, updated_at),
        CONSTRAINT fk_bet_orders_decision FOREIGN KEY (decision_id)
          REFERENCES bet_decisions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT fk_bet_orders_account FOREIGN KEY (account_id)
          REFERENCES bankroll_accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_bet_orders_amounts CHECK (
          requested_stake > 0 AND minimum_odd > 1 AND requested_odd >= minimum_odd
          AND (accepted_stake IS NULL OR (accepted_stake > 0 AND accepted_stake <= requested_stake))
          AND (payout IS NULL OR payout >= 0)
        ),
        CONSTRAINT chk_bet_orders_accepted CHECK (
          status NOT IN ('ACCEPTED', 'SETTLED')
          OR (external_order_id IS NOT NULL AND accepted_odd IS NOT NULL
              AND accepted_stake IS NOT NULL AND accepted_at IS NOT NULL)
        ),
        CONSTRAINT chk_bet_orders_unknown CHECK (status <> 'UNKNOWN' OR unknown_since IS NOT NULL)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE bet_receipts (
        id char(36) NOT NULL,
        order_id char(36) NOT NULL,
        receipt_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        redacted_payload json NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_bet_receipts_order (order_id),
        UNIQUE KEY uq_bet_receipts_receipt_hash (receipt_hash),
        CONSTRAINT fk_bet_receipts_order FOREIGN KEY (order_id)
          REFERENCES bet_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE reconciliation_runs (
        id char(36) NOT NULL,
        idempotency_key varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        account_id char(36) NOT NULL,
        range_from datetime(3) NOT NULL,
        range_to datetime(3) NOT NULL,
        status varchar(20) NOT NULL,
        critical_count int NOT NULL DEFAULT 0,
        summary json NULL,
        error varchar(500) NULL,
        requested_by_user_id char(36) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        completed_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_reconciliation_runs_idempotency_key (idempotency_key),
        KEY idx_reconciliation_runs_account_created (account_id, created_at),
        CONSTRAINT fk_reconciliation_runs_account FOREIGN KEY (account_id)
          REFERENCES bankroll_accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_reconciliation_runs_range CHECK (range_from < range_to)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE reconciliation_items (
        id char(36) NOT NULL,
        run_id char(36) NOT NULL,
        order_id char(36) NULL,
        item_type varchar(20) NOT NULL,
        result varchar(30) NOT NULL,
        severity varchar(10) NOT NULL,
        detail varchar(255) NOT NULL,
        expected json NULL,
        observed json NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_reconciliation_items_run (run_id, severity),
        KEY idx_reconciliation_items_order (order_id),
        CONSTRAINT fk_reconciliation_items_run FOREIGN KEY (run_id)
          REFERENCES reconciliation_runs (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT fk_reconciliation_items_order FOREIGN KEY (order_id)
          REFERENCES bet_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB;
    `);

    // Backlog lot 6 : l'ordre lié à une écriture de ledger existe désormais.
    await queryRunner.query(`
      ALTER TABLE bankroll_ledger_entries
        ADD CONSTRAINT fk_bankroll_ledger_entries_order FOREIGN KEY (order_id)
          REFERENCES bet_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE bankroll_ledger_entries DROP FOREIGN KEY fk_bankroll_ledger_entries_order',
    );
    await queryRunner.query('DROP TABLE reconciliation_items');
    await queryRunner.query('DROP TABLE reconciliation_runs');
    await queryRunner.query('DROP TABLE bet_receipts');
    await queryRunner.query('DROP TABLE bet_orders');
  }
}
