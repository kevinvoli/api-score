import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalkForwardValidation20261002110000
  implements MigrationInterface
{
  name = 'CreateWalkForwardValidation20261002110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE walk_forward_runs (
        id char(36) NOT NULL,
        strategy_version varchar(40) NOT NULL,
        strategy_snapshot json NOT NULL,
        config json NOT NULL,
        config_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        dataset_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        result_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
        status varchar(20) NOT NULL,
        range_from datetime(3) NOT NULL,
        range_to datetime(3) NOT NULL,
        summary json NULL,
        error varchar(500) NULL,
        requested_by_user_id char(36) NULL,
        created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        started_at datetime(3) NULL,
        completed_at datetime(3) NULL,
        PRIMARY KEY (id),
        KEY idx_walk_forward_runs_status (status),
        KEY idx_walk_forward_runs_created_at (created_at),
        CONSTRAINT chk_walk_forward_runs_range CHECK (range_from < range_to)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE walk_forward_folds (
        id char(36) NOT NULL,
        run_id char(36) NOT NULL,
        fold_index int NOT NULL,
        train_from datetime(3) NOT NULL,
        train_to datetime(3) NOT NULL,
        validation_from datetime(3) NOT NULL,
        validation_to datetime(3) NOT NULL,
        test_from datetime(3) NOT NULL,
        test_to datetime(3) NOT NULL,
        status varchar(20) NOT NULL,
        ineligibility_reason varchar(40) NULL,
        metrics json NOT NULL,
        created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_walk_forward_folds_run_index (run_id, fold_index),
        CONSTRAINT fk_walk_forward_folds_run_id FOREIGN KEY (run_id)
          REFERENCES walk_forward_runs (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT chk_walk_forward_folds_order CHECK (
          train_from < train_to AND train_to <= validation_from
          AND validation_from <= validation_to AND validation_to <= test_from
          AND test_from < test_to
        )
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE walk_forward_folds');
    await queryRunner.query('DROP TABLE walk_forward_runs');
  }
}
