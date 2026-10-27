import { listAnnouncements, postAnnouncement } from "@/lib/api";
import { apiRoute, idParam, jsonBody } from "../../../handler";

export const GET = apiRoute((db, req, p) => listAnnouncements(db, idParam(p, "id", "Game"), new URL(req.url).searchParams.get("all") === "1"));

export const POST = apiRoute(async (db, req, p) => postAnnouncement(db, idParam(p, "id", "Game"), await jsonBody(req)));
