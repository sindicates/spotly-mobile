-- Buildings reference data.
--
-- WHY THIS IS A MIGRATION AND NOT SEED DATA. `buildings` is a required field on
-- the add-spot form (SPOT-5), so an empty table is not a thin catalog — it is a
-- dead end: the picker renders with nothing in it and no spot can be created.
-- seed.sql only runs on local `supabase db reset`, which left every hosted
-- environment with the table created and empty. These are real buildings on a
-- real campus, not fake dev rows, so they belong in the schema line rather than
-- the fixture line.
--
-- Idempotent on `name` (the table's unique key), so re-running is safe and a
-- correction here propagates to environments that already ran it.
--
-- SOURCES
--   Names/codes  CWRU Registrar building codes
--                https://case.edu/registrar/general/codes-and-abbreviations/building-codes
--   Grouping     CWRU Facilities campus zones
--                https://case.edu/facilities/departments/facilities-services/campus-zones
--   Coordinates  OpenStreetMap (Overpass, building footprint centroids), 4dp ≈ 11m.
--                Nothing reads them in v1 — they are here for closest-open-spot
--                later, which is the feature that makes backfilling 60 buildings
--                by hand the chore that never gets done.
--
-- TWO DELIBERATE DEPARTURES FROM THE REGISTRAR LIST:
--   * `name` is what a student would pick out of a dropdown, because that is
--     literally what it is used for — the picker renders `name` alone. So
--     "Sears think[box]", not its official "Richey Mixon Building".
--   * The registrar spells HYDN as "Hayden Hall". The building is Haydn Hall,
--     after Hiram Haydn. Facilities and OSM both agree; the registrar has a typo.
--
-- SCOPE: buildings a student would plausibly study in. Excluded on purpose —
-- Greek houses and small card-access residence houses (not spots anyone else can
-- reach), and University Circle neighbours that are not CWRU (CIA, CIM, the
-- museums, Cleveland Clinic). Yost Hall is absent because it was demolished in
-- 2024; its replacement, the Interdisciplinary Science and Engineering Building,
-- opens October 2026 and should be added when it does.

insert into public.buildings (name, short_name, latitude, longitude) values
  -- Libraries and student hubs
  ('Kelvin Smith Library',                    'KSL',              41.5074, -81.6096),
  ('Allen Memorial Medical Library',          'Allen',            41.5060, -81.6085),
  ('Tinkham Veale University Center',         'Tink',             41.5082, -81.6092),
  ('Thwing Center',                           'Thwing',           41.5074, -81.6084),
  ('Sears think[box]',                        'think[box]',       41.5006, -81.6056),

  -- Case Quad: engineering, science, administration
  ('Nord Hall',                               'Nord',             41.5025, -81.6079),
  ('Olin Building',                           'Olin',             41.5022, -81.6079),
  ('Glennan Building',                        'Glennan',          41.5015, -81.6072),
  ('White Building',                          'White',            41.5019, -81.6075),
  ('Wickenden Building',                      'Wickenden',        41.5031, -81.6085),
  ('Bingham Building',                        'Bingham',          41.5023, -81.6068),
  ('Sears Library Building',                  'Sears',            41.5027, -81.6082),
  ('Crawford Hall',                           'Crawford',         41.5046, -81.6098),
  ('Tomlinson Hall',                          'Tomlinson',        41.5040, -81.6096),
  ('A.W. Smith Building',                     'A.W. Smith',       41.5029, -81.6069),
  ('Kent Hale Smith Building',                'KHS',              41.5033, -81.6067),
  ('Rockefeller Building',                    'Rock',             41.5037, -81.6079),
  ('Strosacker Auditorium',                   'Strosacker',       41.5034, -81.6075),
  ('Eldred Hall',                             'Eldred',           41.5040, -81.6079),
  ('Adelbert Hall',                           'Adelbert',         41.5048, -81.6083),
  ('Amasa Stone Chapel',                      'Amasa Stone',      41.5049, -81.6091),
  ('Art Studio',                              'Art Studio',       41.5019, -81.6031),

  -- Agnar Pytte Science Center. Three connected buildings joined by the Hovorka
  -- Atrium; the registrar codes them separately (MILL/CLPP/DGRC) and students
  -- name them separately, so the umbrella name is not a row.
  ('Millis Science Center',                   'Millis',           41.5042, -81.6075),
  ('Clapp Hall',                              'Clapp',            41.5039, -81.6067),
  ('DeGrace Hall',                            'DeGrace',          41.5042, -81.6071),

  -- Mather Quad and north of Euclid
  ('Peter B. Lewis Building',                 'PBL',              41.5100, -81.6080),
  ('Mather Memorial Building',                'Mather Memorial',  41.5095, -81.6070),
  ('Mather House',                            'Mather',           41.5079, -81.6079),
  ('Mather Dance Center',                     'Mather Dance',     41.5082, -81.6082),
  ('Haydn Hall',                              'Haydn',            41.5086, -81.6077),
  ('Guilford House',                          'Guilford',         41.5086, -81.6082),
  ('Clark Hall',                              'Clark',            41.5090, -81.6075),
  ('Harkness Chapel',                         'Harkness',         41.5093, -81.6074),
  ('Gund Hall',                               'Gund',             41.5103, -81.6087),
  ('Mandel School of Applied Social Sciences','Mandel School',    41.5107, -81.6073),
  ('Mandel Community Studies Center',         'Mandel Center',    41.5110, -81.6055),
  ('Dively Building',                         'Dively',           41.5102, -81.6065),
  ('Bellflower Hall',                         'Bellflower',       41.5120, -81.6053),
  ('Linsalata Alumni Center',                 'Linsalata',        41.5118, -81.6068),
  ('Geller Hillel Building',                  'Hillel',           41.5086, -81.6064),
  ('Maltz Performing Arts Center',            'Maltz',            41.5079, -81.6158),

  -- Health Education Campus and the medical/research cluster
  ('Sheila and Eric Samson Pavilion',         'Samson',           41.5046, -81.6201),
  ('Wolstein Research Building',              'Wolstein',         41.5065, -81.6030),
  ('Biomedical Research Building',            'BRB',              41.5050, -81.6044),
  ('Robbins Building',                        'Robbins',          41.5046, -81.6036),
  ('Wood Building',                           'Wood',             41.5042, -81.6047),
  ('Sears Tower',                             'Sears Tower',      41.5043, -81.6041),
  ('Nursing Research Building',               'Nursing',          41.5054, -81.6039),
  ('Dental Research Building',                'Dental',           41.5057, -81.6035),

  -- Athletics and recreation
  ('Veale Convocation and Recreation Center', 'Veale',            41.5012, -81.6062),
  ('Adelbert Gymnasium',                      'Adelbert Gym',     41.5031, -81.6059),
  ('Wyant Athletic and Wellness Center',      'Wyant',            41.5143, -81.6034),

  -- Residential commons. The open ones only — a card-access house lounge is not
  -- a spot anyone else can act on, which is the whole point of an occupancy feed.
  ('Leutner Commons',                         'Leutner',          41.5136, -81.6061),
  ('Fribley Commons',                         'Fribley',          41.5011, -81.6028),
  ('Wade Commons',                            'Wade',             41.5130, -81.6053),
  ('Carlton Commons',                         'Carlton',          41.5002, -81.6018),
  ('Stone Hall',                              'Stone',            41.5126, -81.6075),
  ('Denison Hall',                            'Denison',          41.5131, -81.6051),
  ('Clarke Tower',                            'Clarke',           41.5145, -81.6056),
  ('Stephanie Tubbs Jones Residence Hall',    'Tubbs Jones',      41.5151, -81.6051)
on conflict (name) do update set
  short_name = excluded.short_name,
  latitude   = excluded.latitude,
  longitude  = excluded.longitude;
