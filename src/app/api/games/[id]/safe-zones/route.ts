import { getSafeZones, putSafeZones } from "@/lib/api";
import { apiRoute, idParam, jsonBody } from "../../../handler";

export const GET = apiRoute((db, _req, p) => getSafeZones(db, idParam(p, "id", "Game")));

export const PUT = apiRoute(async (db, req, p) => putSafeZones(db, idParam(p, "id", "Game"), await jsonBody(req)));
