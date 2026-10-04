import { getSettings } from "@/config";
import { fetchXmltv, type ProgrammeRow } from "@/providers/xmltv";
import { xtreamFromSettings } from "./client";

/** The XMLTV guide of the provider: 100 MB upstream, of which we keep the channels asked for. */
export async function* fetchProgrammes(wanted: Set<string>): AsyncGenerator<ProgrammeRow[]> {
  const client = xtreamFromSettings(await getSettings());
  if (!client) throw new Error("Serveur Xtream non configuré");
  yield* fetchXmltv(client.xmltvUrl(), wanted);
}
