import { patchAnnouncement, removeAnnouncement } from "@/lib/api";
import { apiRoute, idParam, jsonBody } from "../../../../handler";

export const PATCH = apiRoute(async (db, req, p) =>
  patchAnnouncement(db, idParam(p, "id", "Game"), idParam(p, "announcementId", "Announcement"), await jsonBody(req)),
);

export const DELETE = apiRoute((db, req, p) =>
  removeAnnouncement(db, idParam(p, "id", "Game"), idParam(p, "announcementId", "Announcement"), new URL(req.url).searchParams.get("andLater") === "1"),
);
