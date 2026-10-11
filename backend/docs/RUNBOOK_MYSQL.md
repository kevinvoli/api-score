# RUNBOOK MySQL - api-score Backend

## Prerequisites

- MySQL 8.0+
- Node.js 20.19+ with npm (Node.js 22 recommended, as in CI)
- `.env` file with valid `MYSQL_*` connection variables

---

## 1. Create the database

Connect to MySQL as root or an admin user, then run:

```sql
CREATE DATABASE IF NOT EXISTS api_score
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

---

## 2. Create the application user (minimal rights)

```sql
CREATE USER IF NOT EXISTS 'api_score_app'@'%' IDENTIFIED BY '<STRONG_PASSWORD>';

GRANT SELECT, INSERT, UPDATE, DELETE, INDEX, CREATE, ALTER, DROP, REFERENCES
  ON api_score.*
  TO 'api_score_app'@'%';

FLUSH PRIVILEGES;
```

> Replace `<STRONG_PASSWORD>` with a strong password. Use `'api_score_app'@'localhost'` instead of `'%'` if the app and DB run on the same host.

---

## 3. Configure the MySQL connection

Set the following variables in your `.env` file (copy `.env.example` if available):

```
MYSQL_HOST=<HOST>
MYSQL_PORT=3306
MYSQL_USER=api_score_app
MYSQL_PASSWORD=<PASSWORD>
MYSQL_DATABASE=api_score
```

Les contrôles d'exécution doivent rester fermés lors d'une installation ou
d'une migration :

```text
REAL_MONEY_INTERLOCK=false
RECONCILIATION_SCHEDULER_ENABLED=false
RECONCILIATION_INTERVAL_MS=300000
```

`REAL_MONEY_INTERLOCK` ne suffit jamais à activer `LIVE_CANARY`. Le scheduler
de réconciliation ne doit être activé qu'après validation QA/review du lot 7 ;
son échec déclenche un arrêt fail-closed.

**Example for local development:**

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=api_score_app
MYSQL_PASSWORD=mypassword
MYSQL_DATABASE=api_score
```

**Example for Docker Compose:**

```
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=api_score_app
MYSQL_PASSWORD=mypassword
MYSQL_DATABASE=api_score
```

---

## 4. Run migrations

After configuring the `MYSQL_*` variables, run TypeORM migrations to create all tables:

```bash
npm run db:migrate
```

To revert the last migration:

```bash
npm run db:migrate:revert
```

---

## 5. Check connectivity

Verify the database connection without starting the full application:

```bash
# After building:
node dist/scripts/check-db-connection.js

# Or directly with ts-node (dev only):
npx ts-node -r tsconfig-paths/register src/scripts/check-db-connection.ts
```

- **Exit code 0** → connection successful
- **Exit code 1** → connection failed (error details printed to stderr)

---

## 6. Start the application

```bash
# Development
npm run start:dev

# Production
npm run build && npm run start:prod
```

---

## Troubleshooting

| Error message | Cause | Fix |
|---|---|---|
| `MYSQL_* is missing` | Missing `.env` or connection variable | Set all five `MYSQL_*` variables |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL not running | Start MySQL service |
| `Access denied for user` | Wrong credentials | Check `MYSQL_USER` and `MYSQL_PASSWORD` |
| `Unknown database 'api_score'` | DB not created | Run `CREATE DATABASE` (step 1) |
| `Table 'api_score.xxx' doesn't exist` | Migrations not applied | Run `npm run db:migrate` |
| `ER_NOT_SUPPORTED_AUTH_MODE` | MySQL 8 auth plugin | Use `mysql_native_password` or `caching_sha2_password` compatible driver |

---

## Notes

- Never commit `.env` to version control.
- The application user must NOT have `GRANT OPTION` or `SUPER` privileges.
- `synchronize: false` is enforced in TypeORM configuration — schema changes go through migrations only.
- Keep `REAL_MONEY_INTERLOCK=false` and `RECONCILIATION_SCHEDULER_ENABLED=false`
  during migrations and initial startup.
