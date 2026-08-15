-- Fake data for local development. Runs automatically on `supabase db reset`
-- (config.toml -> [db.seed] sql_paths).
--
-- Scope: 30 CWRU buildings, 28 spots, 8 seed accounts, ~60 reviews, check-ins
-- arranged to exercise both occupancy states, favorites, one open report.
--
-- WHAT THIS DOES NOT DO: embeddings. reviews.embedding is left null, so these
-- rows are invisible to search_reviews (it filters `embedding is not null`).
-- That is deliberate rather than a gap — a fake vector would rank as a real
-- match and make the SEARCH-4 threshold impossible to calibrate. Backfill by
-- running every body through the `embed` Edge Function once it exists; the
-- doc's plan is one batched OpenAI call, not one per row.
--
-- Runs as postgres on reset, so RLS and the client grants do not apply here.
-- The .edu gate (AUTH-1) is an Auth-API hook, not a DB trigger, so these direct
-- inserts bypass it — every seed address is case.edu regardless.


-- ---------------------------------------------------------------------------
-- Seed accounts
-- ---------------------------------------------------------------------------
-- Eight, because reviews is unique on (spot_id, author_id): one account can
-- hold at most one review per spot, so a pool of eight is what allows several
-- reviews on the same spot.
--
-- No passwords — the app is magic-link only. The identities rows are what let
-- these addresses actually receive a local magic link via Inbucket.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
  v.email, '',
  now() - interval '40 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now() - interval '40 days', now() - interval '40 days',
  '', '', '', ''
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'axr101@case.edu'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'bmt204@case.edu'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'cjd318@case.edu'),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'dnl427@case.edu'),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'ekp539@case.edu'),
  ('11111111-1111-4111-8111-000000000006'::uuid, 'fhs642@case.edu'),
  ('11111111-1111-4111-8111-000000000007'::uuid, 'gwm755@case.edu'),
  ('11111111-1111-4111-8111-000000000008'::uuid, 'hly868@case.edu')
) as v(id, email);

-- profiles rows come from the on_auth_user_created trigger, not from here.

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'
from auth.users u
where u.email like '%@case.edu';


-- ---------------------------------------------------------------------------
-- Buildings
-- ---------------------------------------------------------------------------
-- Not here. Buildings are real campus reference data, not a dev fixture, so
-- they ship in 20260814194500_buildings_reference_data.sql — a file this seed
-- only joins against by `short_name`. They used to live here, which is why every
-- hosted environment had an empty building picker: seed.sql runs on local
-- `supabase db reset` and nowhere else.


-- ---------------------------------------------------------------------------
-- Spots
-- ---------------------------------------------------------------------------
-- created_by is filled in further down from each spot's earliest review, since
-- that is what it means by construction (spot-catalog.md).

insert into public.spots (building_id, area_name, amenity_tags)
select b.id, v.area_name, v.tags::public.amenity_tag[]
from (values
  ('KSL',        'Fourth floor quiet stacks',      '{quiet,outlets,natural_light,open_late}'),
  ('KSL',        'Second floor group pods',        '{group_tables,lively,whiteboards,outlets}'),
  ('KSL',        'Basement carrels',               '{quiet,outlets,open_late}'),
  ('KSL',        'Freedman Center front tables',   '{outlets,group_tables,whiteboards}'),
  ('Tink',       'Second floor balcony seating',   '{natural_light,lively,food_nearby,outlets}'),
  ('Tink',       'Ground floor window bar',        '{natural_light,food_nearby,outlets,lively}'),
  ('think[box]', 'Fourth floor open work tables',  '{group_tables,whiteboards,outlets,open_late}'),
  ('think[box]', 'Seventh floor corner desks',     '{quiet,natural_light,outlets}'),
  ('Nord',       'Third floor hallway alcove',     '{quiet,outlets}'),
  ('Olin',       'First floor lounge',             '{group_tables,outlets,lively}'),
  ('Glennan',    'Second floor study room',        '{whiteboards,group_tables,outlets}'),
  ('Sears',      'Rear reading room',              '{quiet,natural_light}'),
  ('Millis',     'Atrium tables',                  '{natural_light,lively,food_nearby}'),
  ('Clapp',      'Second floor bench nook',        '{quiet,natural_light}'),
  ('Mather Memorial', 'Third floor seminar corner', '{quiet,outlets,whiteboards}'),
  ('Crawford',   'Ground floor commons',           '{group_tables,outlets,lively}'),
  ('PBL',        'Third floor glass overlook',     '{natural_light,quiet,outlets}'),
  ('PBL',        'Basement team rooms',            '{whiteboards,group_tables,outlets,open_late}'),
  ('Wolstein',   'Second floor atrium',            '{natural_light,quiet,outlets}'),
  ('Samson',     'Fourth floor pavilion seating',  '{natural_light,quiet,outlets,open_late}'),
  ('Allen',      'Main reading room',              '{quiet,natural_light}'),
  ('Thwing',     'Upstairs ballroom overlook',     '{quiet,natural_light,food_nearby}'),
  ('Leutner',    'Late night dining tables',       '{food_nearby,lively,open_late,outlets}'),
  ('Fribley',    'Back corner booths',             '{food_nearby,outlets,group_tables}'),
  ('Mather',     'Fireplace lounge',               '{quiet,natural_light}'),
  ('Adelbert',   'Second floor corridor seats',    '{quiet,outlets}'),
  ('Veale',      'Upper concourse tables',         '{lively,open_late,outlets}'),
  ('KHS',        'Fifth floor lab annex desks',    '{quiet,outlets,open_late}')
) as v(building_short, area_name, tags)
join public.buildings b on b.short_name = v.building_short;


-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Every body clears the 15-word floor (REV-10) and answers the actual prompt —
-- "What's it good for, and what's the catch?" (REV-11). The catch half matters
-- more than it looks: it is the honest signal the embedding index is built on,
-- and a corpus of pure praise makes vibe queries useless.
--
-- expand_count is varied so trending_score (REV-6) sorts to something other
-- than pure recency, and created_at is spread over six weeks so the decay term
-- has a range to work across.

insert into public.reviews (spot_id, author_id, body, expand_count, created_at, updated_at)
select s.id, u.id, v.body, v.expands,
       now() - (v.age_days || ' days')::interval,
       now() - (v.age_days || ' days')::interval
from (values
  ('KSL','Fourth floor quiet stacks','axr101@case.edu','Genuinely silent, the kind of quiet where you can hear the elevator two floors down. Outlets at every carrel. Catch is it fills by ten on weekdays.',41,3),
  ('KSL','Fourth floor quiet stacks','bmt204@case.edu','Best place on campus to actually lock in for four hours straight without talking to anyone. Gets cold near the windows, bring a hoodie even in September.',28,9),
  ('KSL','Fourth floor quiet stacks','cjd318@case.edu','Perfect for reading dense material. The catch is that people treat it as sacred, so unwrapping a granola bar gets you glared at from three directions.',17,21),
  ('KSL','Second floor group pods','dnl427@case.edu','Whiteboard in every pod and enough room for five people to spread out laptops. Loud enough that you never feel awkward talking through a problem set.',22,5),
  ('KSL','Second floor group pods','ekp539@case.edu','Great for group projects but you cannot reserve them, so showing up after six on a Tuesday means circling until someone leaves. Go early or forget it.',33,12),
  ('KSL','Basement carrels','fhs642@case.edu','No windows, no distractions, no reason to look up. Open late which is the whole point during finals. Catch is the air gets stale by hour three.',19,7),
  ('KSL','Basement carrels','gwm755@case.edu','If you need to disappear from the world this is where you go. Cell signal is basically nonexistent down there, which is either the feature or the problem.',26,16),
  ('KSL','Freedman Center front tables','hly868@case.edu','Big tables, good for spreading out physical materials and laptops together. Whiteboards on the wall. Gets busy with media projects in the afternoon so mornings are better.',11,14),
  ('KSL','Freedman Center front tables','axr101@case.edu','Solid middle ground between silent and social. You can have a quiet conversation without anyone caring. Not somewhere to take a long phone call though.',9,28),
  ('Tink','Second floor balcony seating','bmt204@case.edu','Light floods in all afternoon and you can watch the whole building move below you. Food is downstairs. Catch is the noise carries straight up from the atrium.',35,4),
  ('Tink','Second floor balcony seating','cjd318@case.edu','Good for the kind of work where you want ambient life around you rather than silence. Terrible for anything requiring sustained focus, honestly. Know which one you need.',24,11),
  ('Tink','Ground floor window bar','dnl427@case.edu','Outlets along the whole bar and coffee is thirty seconds away. Great for a ninety minute session between classes. Anything longer and your back will complain.',15,6),
  ('Tink','Ground floor window bar','ekp539@case.edu','Prime people watching, which is exactly the problem if you have real work. Best used when you want to feel productive around others rather than actually concentrate.',30,19),
  ('think[box]','Fourth floor open work tables','fhs642@case.edu','Enormous tables, whiteboards everywhere, and nobody minds if you talk through a design. Open very late. Catch is tool noise from the shop floors carries up.',20,8),
  ('think[box]','Fourth floor open work tables','gwm755@case.edu','My default for group work now. Plenty of outlets and the staff leave you alone. Weekends are dead quiet which makes it even better than weekdays.',14,25),
  ('think[box]','Seventh floor corner desks','hly868@case.edu','Almost nobody knows the seventh floor has seating. Quiet, huge windows, and you get the skyline. Catch is exactly one bathroom and a slow elevator.',38,2),
  ('think[box]','Seventh floor corner desks','axr101@case.edu','Closest thing to a private office you will find as an undergrad here. Only a handful of desks though, so it is genuinely luck of the draw.',21,17),
  ('Nord','Third floor hallway alcove','bmt204@case.edu','Two chairs and a small table nobody ever uses, tucked past the lecture halls. Silent between class changes. Catch is the five minutes when it absolutely is not.',12,13),
  ('Nord','Third floor hallway alcove','cjd318@case.edu','Great emergency spot when the library is full and you have an hour to kill. Not a destination, but it has an outlet and it is always free.',7,30),
  ('Olin','First floor lounge','dnl427@case.edu','Comfortable couches and big tables, good for engineering group work where you are all sharing one screen. Gets rowdy in the evenings when clubs meet nearby.',16,10),
  ('Olin','First floor lounge','ekp539@case.edu','Works well for casual collaboration but the couches are a trap if you are already tired. Plenty of outlets, decent lighting, and no one polices noise.',13,23),
  ('Glennan','Second floor study room','fhs642@case.edu','Whiteboard walls on two sides make it ideal for working through circuits or proofs as a group. First come first served, and it goes fast before exams.',18,7),
  ('Glennan','Second floor study room','gwm755@case.edu','Small room, big whiteboards, door that closes. That combination is rarer on this campus than it should be. Catch is there is exactly one of them.',25,20),
  ('Sears','Rear reading room','hly868@case.edu','Old wooden tables and tall windows, feels like a different decade. Very quiet. No outlets anywhere near the good seats, which is the whole catch.',23,5),
  ('Sears','Rear reading room','axr101@case.edu','Beautiful room for reading physical books and taking handwritten notes. Bring a fully charged laptop or accept you are doing analog work today.',10,18),
  ('Millis','Atrium tables','bmt204@case.edu','Bright, open, and there is coffee right there. Good for lighter reading or answering email. The acoustics mean every conversation in the building reaches you.',17,9),
  ('Millis','Atrium tables','cjd318@case.edu','Nice between organic chemistry lectures since you are already in the building. Not where you go to write a paper. Great where you go to not go home.',8,26),
  ('Clapp','Second floor bench nook','dnl427@case.edu','A window bench with a view of the quad that somehow stays empty. Quiet, warm in the afternoon sun. No table, so laptop on lap only.',14,15),
  ('Mather Memorial','Third floor seminar corner','ekp539@case.edu','Quiet corner with a small whiteboard and reliable outlets, right outside the seminar rooms. Empty most afternoons. Gets used as overflow during department events.',11,12),
  ('Mather Memorial','Third floor seminar corner','fhs642@case.edu','Underrated. Close to the humanities offices so it stays calm, and the chairs are actually good for long sessions. Nothing nearby if you get hungry.',9,29),
  ('Crawford','Ground floor commons','gwm755@case.edu','Big shared tables and a constant hum of people, good if silence makes you restless. Outlets are plentiful. Coffee line at ten is genuinely disruptive though.',19,6),
  ('Crawford','Ground floor commons','hly868@case.edu','My go to for group problem sets because nobody minds noise and there is always space. Lighting is harsh and there are no windows in the middle.',15,22),
  ('PBL','Third floor glass overlook','axr101@case.edu','Wall of glass, silent, and the architecture makes you feel like you should be doing something important. Business students dominate it during their exam weeks.',27,4),
  ('PBL','Third floor glass overlook','bmt204@case.edu','One of the prettiest quiet spots on campus and the light is incredible until sunset. Catch is that it is a long walk from anywhere on north side.',22,16),
  ('PBL','Basement team rooms','cjd318@case.edu','Bookable rooms with whiteboards and a door, open late during the semester. If you can get one, group work becomes twice as fast. That is the catch.',31,8),
  ('PBL','Basement team rooms','dnl427@case.edu','Genuinely the best group space I have used here, but the booking system means undergrads outside Weatherhead rarely get a slot. Worth trying anyway.',16,24),
  ('Wolstein','Second floor atrium','ekp539@case.edu','Quiet in a way medical buildings tend to be, with good natural light and plenty of outlets. Long walk from main campus unless you already have class nearby.',13,11),
  ('Wolstein','Second floor atrium','fhs642@case.edu','Almost always empty in the afternoon which makes it reliable when everything else is packed. Nothing to eat nearby, so plan around that or bring food.',10,27),
  ('Samson','Fourth floor pavilion seating','gwm755@case.edu','Newest building on campus and it shows. Quiet, bright, open late, and outlets everywhere. Catch is the shuttle ride if you are not already at the health campus.',29,5),
  ('Samson','Fourth floor pavilion seating','hly868@case.edu','Feels like working in an airport lounge in the best way. Very calm even at night. Nursing and med students fill it during their block exam weeks.',18,14),
  ('Allen','Main reading room','axr101@case.edu','Historic reading room that stays genuinely silent, with beautiful light in the morning. Limited hours compared to KSL and outlets are scarce at the long tables.',21,10),
  ('Allen','Main reading room','bmt204@case.edu','Worth the walk if you want somewhere that feels serious. Not practical for a full day since it closes earlier than you will want it to.',12,25),
  ('Thwing','Upstairs ballroom overlook','cjd318@case.edu','Quiet upstairs seating overlooking the ballroom, with food downstairs when you need a break. Gets closed off without warning whenever an event is booked.',15,9),
  ('Thwing','Upstairs ballroom overlook','dnl427@case.edu','Nice light and almost nobody up there most days. Check the event calendar first or you will carry your laptop back down the stairs for nothing.',8,20),
  ('Leutner','Late night dining tables','ekp539@case.edu','Open late with food right there, which during finals is the only thing that matters. Loud and bright, so bring headphones and low expectations for focus.',24,6),
  ('Leutner','Late night dining tables','fhs642@case.edu','Good for the eleven pm shift when everything else is closed and you need caffeine within reach. Tables get sticky and staff start cleaning around you.',17,18),
  ('Fribley','Back corner booths','gwm755@case.edu','Booths in the back are surprisingly private for a dining hall, and there are outlets along that wall. Empties out completely after the dinner rush ends.',14,12),
  ('Fribley','Back corner booths','hly868@case.edu','Solid south side option if you live down there and do not want to walk. Peak meal times are unusable, but the gap hours are genuinely fine.',9,26),
  ('Mather','Fireplace lounge','axr101@case.edu','Quiet lounge with a fireplace and good afternoon light, the kind of place you read in rather than grind in. No outlets near the comfortable chairs.',20,7),
  ('Mather','Fireplace lounge','bmt204@case.edu','Lovely for reading and terrible for anything with a deadline, because you will fall asleep in those chairs. I say that from direct personal experience.',26,21),
  ('Adelbert','Second floor corridor seats','cjd318@case.edu','A few seats along the corridor that stay quiet because it is mostly administrative offices. Outlets are there. Nothing scenic, but it is dependably empty.',7,15),
  ('Veale','Upper concourse tables','dnl427@case.edu','Tables above the courts, open late, and the background noise of practice is weirdly good for grinding through problem sets. Not for reading anything subtle.',13,8),
  ('Veale','Upper concourse tables','ekp539@case.edu','Useful if you are already there for a workout and want to knock out an hour. Gets genuinely loud during home games, which is entirely predictable.',11,23),
  ('KHS','Fifth floor lab annex desks','fhs642@case.edu','Quiet desks near the labs that graduate students use, and undergrads are welcome. Open late, outlets everywhere. Almost no signage so it is hard to find first time.',16,5),
  ('KHS','Fifth floor lab annex desks','gwm755@case.edu','Best kept secret for anyone in the sciences who wants silence without walking to the library. Fluorescent lighting is rough after a couple of hours.',22,17)
) as v(building_short, area_name, author_email, body, expands, age_days)
join public.buildings b on b.short_name = v.building_short
join public.spots s     on s.building_id = b.id and s.area_name = v.area_name
join auth.users u       on u.email = v.author_email;

-- A spot's creator is by construction the author of its first review
-- (spot-catalog.md). Derive it rather than seeding it independently, so the two
-- cannot disagree.
update public.spots s
   set created_by = first_review.author_id
from (
  select distinct on (spot_id) spot_id, author_id
  from public.reviews
  order by spot_id, created_at asc
) as first_review
where first_review.spot_id = s.id;


-- ---------------------------------------------------------------------------
-- Check-ins
-- ---------------------------------------------------------------------------
-- Arranged to exercise both branches of OCC-4, because "no recent reports" is
-- the state most likely to be implemented wrong:
--
--   * 12 spots have a report inside the 60-minute window -> occupancy pill
--   * 4 spots have only stale reports -> must render "no recent reports",
--     never the stale status, and never "last seen N hours ago"
--   * the remaining 12 have never been checked into at all
--
-- Stale rows are inserted before recent ones for the same spot so the
-- 15-minute rate-limit trigger sees them as old. Authors rotate anyway.

-- Stale: outside the window. These must not surface anywhere.
insert into public.check_ins (spot_id, author_id, status, created_at)
select s.id, u.id, v.status::public.occupancy_status,
       now() - (v.age_minutes || ' minutes')::interval
from (values
  ('KSL',      'Freedman Center front tables', 'axr101@case.edu', 'packed',     185),
  ('Sears',    'Rear reading room',            'bmt204@case.edu', 'empty',      420),
  ('Mather',   'Fireplace lounge',             'cjd318@case.edu', 'some_seats', 260),
  ('Adelbert', 'Second floor corridor seats',  'dnl427@case.edu', 'empty',      1310)
) as v(building_short, area_name, author_email, status, age_minutes)
join public.buildings b on b.short_name = v.building_short
join public.spots s     on s.building_id = b.id and s.area_name = v.area_name
join auth.users u       on u.email = v.author_email;

-- Fresh: inside the window. Several spots carry two reports so the view's
-- `distinct on ... order by created_at desc` has something to actually pick
-- between rather than trivially returning the only row.
insert into public.check_ins (spot_id, author_id, status, created_at)
select s.id, u.id, v.status::public.occupancy_status,
       now() - (v.age_minutes || ' minutes')::interval
from (values
  ('KSL',        'Fourth floor quiet stacks',     'axr101@case.edu', 'some_seats', 52),
  ('KSL',        'Fourth floor quiet stacks',     'bmt204@case.edu', 'packed',      8),
  ('KSL',        'Second floor group pods',       'cjd318@case.edu', 'packed',     14),
  ('KSL',        'Basement carrels',              'dnl427@case.edu', 'some_seats', 31),
  ('Tink',       'Second floor balcony seating',  'ekp539@case.edu', 'packed',     47),
  ('Tink',       'Second floor balcony seating',  'fhs642@case.edu', 'packed',      6),
  ('Tink',       'Ground floor window bar',       'gwm755@case.edu', 'some_seats', 22),
  ('think[box]', 'Fourth floor open work tables', 'hly868@case.edu', 'empty',      39),
  ('think[box]', 'Seventh floor corner desks',    'axr101@case.edu', 'empty',      11),
  ('Olin',       'First floor lounge',            'bmt204@case.edu', 'some_seats', 55),
  ('Crawford',   'Ground floor commons',          'cjd318@case.edu', 'packed',     17),
  ('PBL',        'Third floor glass overlook',    'dnl427@case.edu', 'some_seats', 43),
  ('PBL',        'Basement team rooms',           'ekp539@case.edu', 'packed',      3),
  ('Samson',     'Fourth floor pavilion seating', 'fhs642@case.edu', 'empty',      26),
  ('Leutner',    'Late night dining tables',      'gwm755@case.edu', 'packed',     19),
  ('Veale',      'Upper concourse tables',        'hly868@case.edu', 'some_seats', 58)
) as v(building_short, area_name, author_email, status, age_minutes)
join public.buildings b on b.short_name = v.building_short
join public.spots s     on s.building_id = b.id and s.area_name = v.area_name
join auth.users u       on u.email = v.author_email;


-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------
-- Two accounts with overlapping lists, so the favorites screen has content
-- under whichever seed account you sign in as, and so a shared spot proves the
-- lists stay private rather than merging (FAV-3).

insert into public.favorites (account_id, spot_id)
select u.id, s.id
from (values
  ('axr101@case.edu', 'KSL',        'Fourth floor quiet stacks'),
  ('axr101@case.edu', 'think[box]', 'Seventh floor corner desks'),
  ('axr101@case.edu', 'PBL',        'Third floor glass overlook'),
  ('axr101@case.edu', 'Sears',      'Rear reading room'),
  ('axr101@case.edu', 'Samson',     'Fourth floor pavilion seating'),
  ('bmt204@case.edu', 'KSL',        'Fourth floor quiet stacks'),
  ('bmt204@case.edu', 'KSL',        'Basement carrels'),
  ('bmt204@case.edu', 'Leutner',    'Late night dining tables')
) as v(author_email, building_short, area_name)
join public.buildings b on b.short_name = v.building_short
join public.spots s     on s.building_id = b.id and s.area_name = v.area_name
join auth.users u       on u.email = v.author_email;


-- ---------------------------------------------------------------------------
-- Survey responses
-- ---------------------------------------------------------------------------
-- ONB-6: stored, unused in v1. Seeded so the table is not empty the first time
-- someone goes looking for the shape of the JSON.

insert into public.survey_responses (user_id, answers)
select u.id, v.answers::jsonb
from (values
  ('axr101@case.edu', '{"noise":"silence","company":"alone","outlet":true,"time_of_day":"late_night"}'),
  ('bmt204@case.edu', '{"noise":"background","company":"people","outlet":true,"time_of_day":"afternoon"}'),
  ('cjd318@case.edu', '{"noise":"silence","company":"alone","outlet":false,"time_of_day":"morning"}')
) as v(author_email, answers)
join auth.users u on u.email = v.author_email;


-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- One open item so the MOD-2 queue ("resolved_at is null") is non-empty in the
-- dashboard, and the moderation path can be walked end to end before launch
-- rather than the first time someone actually reports something.

insert into public.reports (review_id, reporter_id, reason)
select r.id, u.id, 'Test report — names a specific staff member (MOD-3).'
from public.reviews r
join public.spots s     on s.id = r.spot_id
join public.buildings b on b.id = s.building_id
join auth.users u       on u.email = 'hly868@case.edu'
where b.short_name = 'Millis'
  and s.area_name = 'Atrium tables'
  and r.author_id = (select id from auth.users where email = 'cjd318@case.edu');
