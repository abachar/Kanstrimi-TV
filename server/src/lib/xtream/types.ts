/** Loosely typed Xtream Codes payloads — we keep raw objects and only read what we need. */
export type XCategory = { category_id: string | number; category_name: string; parent_id?: number | string };
export type XStream = Record<string, unknown> & {
  num?: number; name: string; stream_id?: number; series_id?: number;
  category_id?: string | number | null; category_ids?: (string | number)[];
  stream_icon?: string; cover?: string; container_extension?: string; direct_source?: string;
  added?: string; last_modified?: string; rating?: string | number; rating_5based?: number;
  plot?: string; genre?: string; releaseDate?: string; releasedate?: string; backdrop_path?: string[];
  cast?: string; director?: string; youtube_trailer?: string; tmdb?: string | number;
};
export type XUserInfo = {
  username: string; password: string; message?: string; auth: number; status: string;
  exp_date?: string | null; is_trial?: string; active_cons?: string | number; created_at?: string;
  max_connections?: string | number; allowed_output_formats?: string[];
};
export type XServerInfo = {
  url: string; port: string; https_port?: string; server_protocol: string; rtmp_port?: string;
  timezone?: string; timestamp_now?: number; time_now?: string; process?: boolean;
};
export type XAccount = { user_info: XUserInfo; server_info: XServerInfo };
