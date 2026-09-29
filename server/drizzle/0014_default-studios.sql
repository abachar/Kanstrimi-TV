-- The default studio hubs, editable in the admin. Names and logos as TMDB gives them.
INSERT INTO "studios" ("kind", "tmdb_id", "name", "logo_path", "position") VALUES
  ('company', 3, 'Pixar', '/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png', 1),
  ('company', 420, 'Marvel Studios', '/hUzeosd33nzE5MCNsZxCGEKTXaQ.png', 2),
  ('company', 1, 'Lucasfilm Ltd.', '/tlVSws0RvvtPBwViUyOFAO0vcQS.png', 3),
  ('company', 2, 'Walt Disney Pictures', '/wdrCwmRnLFJhEoH8GSfymY85KHT.png', 4),
  ('company', 521, 'DreamWorks Animation', '/3BPX5VGBov8SDqTV7wC1L1xShAS.png', 5),
  ('company', 10342, 'Studio Ghibli', '/uFuxPEZRUcBTEiYIxjHJq62Vr77.png', 6),
  ('company', 41077, 'A24', '/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png', 7),
  ('company', 3172, 'Blumhouse Productions', '/rzKluDcRkIwHZK2pHsiT667A2Kw.png', 8),
  ('company', 174, 'Warner Bros. Pictures', '/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png', 9),
  ('network', 49, 'HBO', '/hizvY65SpyF3BPY2qsBZMgUOxjs.png', 10),
  ('network', 213, 'Netflix', '/wwemzKWzjKYJFfCeiB57q3r4Bcm.png', 11),
  ('network', 2552, 'Apple TV', '/bngHRFi794mnMq34gfVcm9nDxN1.png', 12),
  ('network', 1024, 'Prime Video', '/w7HfLNm9CWwRmAMU58udl2L7We7.png', 13),
  ('network', 2739, 'Disney+', '/1edZOYAfoyZyZ3rklNSiUpXX30Q.png', 14),
  ('network', 285, 'Canal+', '/9aotxauvc9685tq9pTcRJszuT06.png', 15),
  ('network', 1628, 'ARTE', '/6UIpEURdjnmcJPwgTDRzVRuwADr.png', 16)
ON CONFLICT DO NOTHING;
