/**
 * Dev seed: creates an admin and a set of players in a running game.
 *   npm run seed -- --players 12 --team-size 3 [--registration]
 * Every seeded account's password is "password123".
 */
import path from "node:path";
import { eq } from "drizzle-orm";
import { openDb } from "../src/db";
import { users } from "../src/db/schema";
import { createUser, getRegistrationCode, setRegistrationCode } from "../src/lib/auth";
import * as G from "../src/lib/game";

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const playerCount = arg("players", 12);
const teamSize = arg("team-size", 1);
const registrationOnly = args.includes("--registration");

const FIRST = ["Alex", "Blair", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jules", "Kai", "Logan", "Morgan", "Noor", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Taylor", "Uma", "Val", "Wren", "Yael"];

async function main() {
  const db = openDb(path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "assassins.db"));
  const ensure = async (username: string, displayName: string, isAdmin = false) =>
    db.select().from(users).where(eq(users.username, username)).get() ??
    (await createUser(db, { username, displayName, password: "password123", isAdmin }));

  const admin = await ensure("admin", "Game Admin", true);
  const live = G.getCurrentGame(db);
  if (live && live.status !== "finished") {
    console.log(`A game is already running ("${live.name}"). Finish it before seeding another.`);
    return;
  }
  const game = G.createGame(db, admin.id, `Seeded game ${new Date().toLocaleDateString()}`);
  G.updateGameSettings(db, admin.id, game.id, { maxTeamSize: teamSize, minTeamSize: 1, inactivityDays: 3 });
  G.openRegistration(db, admin.id, game.id);
  const code = G.getGame(db, game.id).joinCode;
  for (let i = 0; i < playerCount; i++) {
    const name = `${FIRST[i % FIRST.length]}${i >= FIRST.length ? ` ${Math.floor(i / FIRST.length) + 1}` : ""}`;
    const u = await ensure(`player${i + 1}`, name);
    G.joinGame(db, u.id, game.id, code);
  }
  G.autoFillTeams(db, admin.id, game.id, teamSize);
  if (!registrationOnly) G.startGame(db, admin.id, game.id);
  console.log(`Seeded "${game.name}" with ${playerCount} players in teams of ${teamSize}.`);
  const regCode = getRegistrationCode(db) ?? setRegistrationCode(db, null);
  console.log(`Log in as admin / password123, or player1..player${playerCount} / password123. Join code: ${code}. Registration code: ${regCode}`);
}

main();
