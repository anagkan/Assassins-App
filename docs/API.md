# Announcements & safe-zones API

A small JSON API for scripts or an AI agent: post announcements (immunities, rules, item drops, news) and keep the safe-zone list up to date. It does what the admin **Announcements** page and the **Safe zones** setting do, with the same checks, and every change shows in the audit log with "System" as the actor.

## Turning it on
Add a token of at least 32 characters to `.env`, then restart (`docker compose up -d`):

```
AGENT_API_TOKEN=<output of: openssl rand -hex 32>
```

Every request must send `Authorization: Bearer <token>`. Without the token set, every request gets `401`. Anyone with the token can post announcements and edit safe zones, so keep it secret and change it if it leaks.

## Conventions
- Base URL: `https://<your domain>/api`. Bodies are JSON.
- Times are sent as ISO 8601 (`"2026-10-30T08:00:00-04:00"`) or epoch milliseconds. A time with no offset (`"2026-10-30T08:00"`) or a bare date (`"2026-10-30"`) is read in the server's `TZ`. Responses give times in UTC ISO format.
- Errors return `{"error": "..."}` with `400` (bad input), `401` (bad or missing token) or `404` (no such game or announcement).

## Endpoints

### `GET /api/games`
Lists games, newest first, along with `currentGameId`, the game players currently see. Use that id below.
```json
{ "currentGameId": 3, "games": [{ "id": 3, "name": "Fall 2026", "status": "active" }] }
```

### `GET /api/games/:id/announcements`
Lists announcements that haven't ended, earliest start first. Add `?all=1` to include ended ones. Each item:
```json
{ "id": 12, "kind": "immunity", "title": "Goggles", "body": "", "activeFrom": "...", "activeUntil": "...", "active": true, "seriesId": null }
```

### `POST /api/games/:id/announcements`
| Field | | |
|---|---|---|
| `title` | required | Up to 200 characters |
| `kind` | optional | `immunity`, `rule` or `general` (default) |
| `body` | optional | Up to 2000 characters |
| `activeFrom` | optional | Defaults to now |
| `activeUntil` | optional | Omit or `null` to keep it up until it's deleted |
| `repeat` | optional | `{ "weekdays": [1, 3], "until": "2026-11-20" }` posts one copy on each listed weekday (0 = Sunday) through `until`, keeping the first copy's times. Each copy must end within 24 hours of starting. |

Returns `{ "posted": n, "announcements": [...] }`.

**Items** don't have their own type yet. Post them as `general` announcements whose title starts with "Item:", for example `{"title": "Item: shield at Frist", "body": "First to grab it is immune until 8pm", "activeUntil": "2026-10-30T20:00"}`.

### `PATCH /api/games/:id/announcements/:announcementId`
Send only the fields you want to change. `"activeUntil": null` makes it never end. In a series, only this copy changes.

### `DELETE /api/games/:id/announcements/:announcementId`
Add `?andLater=1` to also delete every later copy in its series. Returns `{ "deleted": n }`.

### `GET /api/games/:id/safe-zones`
Returns `{ "markdown": "..." }`, the safe-zone list players see on the Rules page.

### `PUT /api/games/:id/safe-zones`
`{ "markdown": "- Dining halls\n- Libraries" }` replaces the whole list. To add or remove one zone, `GET` the list first, edit it, then `PUT` it back.

## Example
```sh
curl -X POST https://assassins.example.com/api/games/3/announcements \
  -H "Authorization: Bearer $AGENT_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"immunity","title":"Wear a hat","activeFrom":"2026-10-30T08:00","activeUntil":"2026-10-30T20:00"}'
```
