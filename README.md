# Colonial Assassins

A self-hosted web app for running the Colonial Club's **Assassins** game every semester. It supports solo games and teams of any size, with admin-approved kills, a public kill feed, standings, daily immunities and inactivity purges.

- **Players** sign up with the semester's join code, then form or join a team. Each player sees their target, reports kills and watches the feed.
- **Admins** run the game: set rules, approve or reject kills, post immunities, purge inactive teams, fix mistakes, and hand admin rights to the next officers.

Running a semester? See **[docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)**.

## How the game works

Every team is secretly assigned another team as its target, and the targets form a single loop. Any alive member of your team may eliminate any alive member of your target team, and an admin approves each reported kill. A team is out once all of its members are out. The team that finished them off inherits their target. Last team standing wins. A solo game is just teams of one.

## Tech

Next.js 15 (App Router, server actions) · TypeScript · Tailwind CSS 4 · SQLite (better-sqlite3 + Drizzle ORM) · Vitest · Docker + Caddy (automatic HTTPS).

The whole app is one container plus one SQLite file. There is no external database and no email service.

## Deploying to a VPS

You need a Linux VPS with at least 1 GB RAM (Ubuntu 24.04 is fine) and a domain or subdomain.

1. **Point DNS.** Create an `A` record (e.g. `assassins.yourdomain.com`) pointing to the VPS IP address.
2. **Install Docker**:
   ```sh
   curl -fsSL https://get.docker.com | sh
   ```
3. **Get the code and configure it:**
   ```sh
   sudo git clone <this repo> /opt/assassins && cd /opt/assassins
   sudo cp .env.example .env && sudo nano .env   # set DOMAIN, ADMIN_USERNAME, ADMIN_PASSWORD
   ```
4. **Start it:**
   ```sh
   sudo docker compose up -d --build
   ```
   Caddy fetches an HTTPS certificate automatically, which needs ports 80 and 443 open. Visit `https://<DOMAIN>`, log in with the admin account from `.env`, and change its password under **Account**.
5. **Schedule backups** with `sudo crontab -e`:
   ```
   0 4 * * * cd /opt/assassins && ./scripts/backup.sh >> backups/backup.log 2>&1
   ```

### Updating
```sh
cd /opt/assassins && sudo git pull && sudo docker compose up -d --build
```
Database migrations run automatically on startup.

### Backups and restore
`./scripts/backup.sh` takes a consistent snapshot while the app is running and saves it to `./backups/`, keeping the newest 30. Copy that folder off the server now and then.

To restore:
```sh
sudo docker compose stop app
sudo docker compose run --rm -v "$PWD/backups:/backups:ro" --entrypoint sh app \
  -c "cp /backups/assassins-YYYYMMDD-HHMMSS.db /data/assassins.db && rm -f /data/assassins.db-wal /data/assassins.db-shm"
sudo docker compose start app
```

### Locked out of every admin account?
```sh
sudo docker compose exec app node scripts/create-admin.cjs <username> <new-password>
```
This creates a new admin, or promotes an existing user and resets their password.

## Local development

```sh
npm install
npm run seed -- --players 12 --team-size 3   # optional demo data (all passwords: password123)
npm run dev                                   # http://localhost:3000
```
- `npm test` runs the game-logic tests, which check that the target ring stays valid after every operation.
- `npm run typecheck` runs the TypeScript checker.
- `npm run seed -- --registration` leaves the seeded game in registration instead of starting it.
- The database lives in `./data/assassins.db`. Delete it to start over.

### Changing the database schema
Edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in `drizzle/`. Migrations apply automatically on the next start.

### Code map
| Path | What's there |
|---|---|
| `src/lib/ring.ts` | Pure target-ring logic (shuffle, remove, insert, validate) |
| `src/lib/game.ts` | Every game rule and state change, each in a DB transaction |
| `src/lib/queries.ts` | Read models for pages (dashboard, feed, standings, admin views) |
| `src/lib/auth.ts`, `session.ts` | Passwords (bcrypt), DB-backed sessions, first-admin setup |
| `src/app/` | Player pages and `actions.ts` (player server actions) |
| `src/app/admin/` | Admin pages and `actions.ts` (admin server actions) |
| `tests/` | Vitest tests for the ring and the game engine |
| `scripts/` | Seed, create-admin, backup |

### Security notes
- Players can only ever load their own team's target. The full ring is only rendered on admin pages.
- Every admin action re-checks `isAdmin` on the server. Server actions also get Next.js's built-in origin (CSRF) check.
- Login and sign-up are rate-limited. Passwords are bcrypt-hashed, and sessions are random tokens stored hashed.
- Uploaded photos are type-sniffed, capped at 3 MB, and only served to logged-in users.
