import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthentication20261002090000 implements MigrationInterface {
  name = 'CreateAuthentication20261002090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE auth_users (
        id char(36) NOT NULL,
        email varchar(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        password_hash varchar(255) NOT NULL,
        role enum('VIEWER','OPERATOR','ADMIN') NOT NULL,
        disabled_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_auth_users_email (email),
        KEY idx_auth_users_role (role)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id char(36) NOT NULL,
        user_id char(36) NOT NULL,
        token_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        expires_at datetime(6) NOT NULL,
        revoked_at datetime(6) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
        KEY idx_auth_sessions_user_id (user_id),
        KEY idx_auth_sessions_expires_at (expires_at),
        CONSTRAINT fk_auth_sessions_user_id FOREIGN KEY (user_id)
          REFERENCES auth_users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE auth_login_attempts (
        identifier_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        failed_count smallint unsigned NOT NULL,
        window_started_at datetime(6) NOT NULL,
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (identifier_hash)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE operation_audit_events (
        id char(36) NOT NULL,
        actor_user_id char(36) NULL,
        action varchar(80) NOT NULL,
        target_type varchar(80) NOT NULL,
        target_id varchar(320) NOT NULL,
        trace_id varchar(64) NULL,
        metadata json NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_operation_audit_events_actor_user_id (actor_user_id),
        KEY idx_operation_audit_events_created_at (created_at),
        KEY idx_operation_audit_events_action_target_created_at
          (action, target_type, target_id, created_at),
        CONSTRAINT fk_operation_audit_events_actor_user_id
          FOREIGN KEY (actor_user_id) REFERENCES auth_users (id)
          ON DELETE SET NULL ON UPDATE RESTRICT
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS operation_audit_events;');
    await queryRunner.query('DROP TABLE IF EXISTS auth_login_attempts;');
    await queryRunner.query('DROP TABLE IF EXISTS auth_sessions;');
    await queryRunner.query('DROP TABLE IF EXISTS auth_users;');
  }
}
