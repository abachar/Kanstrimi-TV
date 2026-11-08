import type { ProviderAccount } from "@/db";
import { fetchXmltv, type ProgrammeRow } from "@/providers/xmltv";
import { xtreamFor } from "./client";

/** The XMLTV guide of one account: 100 MB upstream, of which we keep the channels asked for. */
export function fetchProgrammes(account: ProviderAccount, wanted: Set<string>): AsyncGenerator<ProgrammeRow[]> {
  return fetchXmltv(xtreamFor(account).xmltvUrl(), wanted);
}
