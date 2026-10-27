import { listGames } from "@/lib/api";
import { apiRoute } from "../handler";

export const GET = apiRoute((db) => listGames(db));
