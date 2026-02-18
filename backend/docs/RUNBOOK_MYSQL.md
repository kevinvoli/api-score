# RUNBOOK MySQL - api-score Backend

## Prerequisites

- MySQL 8.0+
- Node.js 18+ with npm
- `.env` file with valid `DB_URL`

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

## 3. Configure DB_URL

Set `DB_URL` in your `.env` file (copy `.env.example` if available):

```
DB_URL=mysql://api_score_app:<PASSWORD>@<HOST>:3306/api_score
```

**Example for local development:**

```
DB_URL=mysql://api_score_app:mypassword@127.0.0.1:3306/api_score
```

**Example for Docker Compose:**

```
DB_URL=mysql://api_score_app:mypassword@mysql:3306/api_score
```

---

## 4. Run migrations

After configuring `DB_URL`, run TypeORM migrations to create all tables:

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
| `DB_URL is not set` | Missing `.env` or env variable | Set `DB_URL` |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL not running | Start MySQL service |
| `Access denied for user` | Wrong credentials | Check username / password in `DB_URL` |
| `Unknown database 'api_score'` | DB not created | Run `CREATE DATABASE` (step 1) |
| `Table 'api_score.xxx' doesn't exist` | Migrations not applied | Run `npm run db:migrate` |
| `ER_NOT_SUPPORTED_AUTH_MODE` | MySQL 8 auth plugin | Use `mysql_native_password` or `caching_sha2_password` compatible driver |

---

## Notes

- Never commit `.env` to version control.
- The application user must NOT have `GRANT OPTION` or `SUPER` privileges.
- `synchronize: false` is enforced in TypeORM configuration — schema changes go through migrations only.
