-- Hosted catalog seed. Idempotent. Does not replace real student rows.
--
-- seed.sql only runs on local `supabase db reset`. The app points at the hosted
-- project, which had one student-created spot and one review. This file is the
-- hosted equivalent of the local fixtures, plus extra spots in buildings that
-- already have photos so the feed is not a wall of placeholders.
--
-- Leaves reviews.embedding null. Run `npm run db:embeddings` (or the Edge
-- Function backfill) afterward or search will not see these rows.
--
-- Does not touch existing accounts (jpu9 / cin9). Seed authors are the same
-- eight case.edu addresses as supabase/seed.sql.

-- ---------------------------------------------------------------------------
-- Seed accounts
-- ---------------------------------------------------------------------------

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
) as v(id, email)
where not exists (select 1 from auth.users u where u.id = v.id or u.email = v.email);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'
from auth.users u
where u.email in (
  'axr101@case.edu','bmt204@case.edu','cjd318@case.edu','dnl427@case.edu',
  'ekp539@case.edu','fhs642@case.edu','gwm755@case.edu','hly868@case.edu'
)
and not exists (
  select 1 from auth.identities i
  where i.user_id = u.id and i.provider = 'email'
);

-- ---------------------------------------------------------------------------
-- Spots
-- ---------------------------------------------------------------------------
-- Skip any building+area that already exists (the student-created Sears
-- "3rd floor" stays). created_by is filled after reviews land.

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
  ('KHS',        'Fifth floor lab annex desks',    '{quiet,outlets,open_late}'),
  -- Extra spots in buildings that already have a primary photo (REV-12).
  ('Gund',       'Library reading tables',         '{quiet,outlets,natural_light}'),
  ('Bellflower', 'First floor study lounge',       '{group_tables,outlets,natural_light}'),
  ('Haydn',      'Second floor window seats',      '{quiet,natural_light}'),
  ('Mandel School', 'Atrium seating',              '{natural_light,group_tables,outlets}'),
  ('Tomlinson',  'Lobby study tables',             '{outlets,lively}'),
  ('Rock',       'Third floor alcove',             '{quiet,outlets}'),
  ('Harkness',   'Narthex seating',                '{quiet,natural_light}'),
  ('Maltz',      'Lobby window seats',             '{natural_light,quiet}')
) as v(building_short, area_name, tags)
join public.buildings b on b.short_name = v.building_short
where not exists (
  select 1
  from public.spots s
  where s.building_id = b.id
    and lower(btrim(s.area_name)) = lower(btrim(v.area_name))
);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Every body clears the 15-word floor and answers "What's it good for, and
-- what's the catch?" Unique on (spot_id, author_id); re-runs skip duplicates.

insert into public.reviews (spot_id, author_id, body, expand_count, created_at, updated_at)
select s.id, u.id, v.body, v.expands,
       now() - (v.age_days || ' days')::interval,
       now() - (v.age_days || ' days')::interval
from (values
  ('KSL','Fourth floor quiet stacks','axr101@case.edu','Genuinely silent, the kind of quiet where you can hear the elevator two floors down. Outlets at every carrel. Catch is it fills by ten on weekdays.',41,3),
  ('KSL','Fourth floor quiet stacks','bmt204@case.edu','Best place on campus to actually lock in for four hours straight without talking to anyone. Gets cold near the windows, bring a hoodie even in September.',28,9),
  ('KSL','Fourth floor quiet stacks','cjd318@case.edu','Perfect for reading dense material. The catch is that people treat it as sacred, so unwrapping a granola bar gets you glared at from three directions.',17,21),
  ('KSL','Fourth floor quiet stacks','dnl427@case.edu','Fourth floor is the only place I trust with a take home exam. Completely silent. Catch is the long walk from the stairs if you sit in the far stacks.',19,2),
  ('KSL','Second floor group pods','dnl427@case.edu','Whiteboard in every pod and enough room for five people to spread out laptops. Loud enough that you never feel awkward talking through a problem set.',22,5),
  ('KSL','Second floor group pods','ekp539@case.edu','Great for group projects but you cannot reserve them, so showing up after six on a Tuesday means circling until someone leaves. Go early or forget it.',33,12),
  ('KSL','Second floor group pods','axr101@case.edu','Pods are the right size for a three person lab report. Catch is the pods nearest the stairs pick up every conversation walking past, so take one further in.',15,1),
  ('KSL','Basement carrels','fhs642@case.edu','No windows, no distractions, no reason to look up. Open late which is the whole point during finals. Catch is the air gets stale by hour three.',19,7),
  ('KSL','Basement carrels','gwm755@case.edu','If you need to disappear from the world this is where you go. Cell signal is basically nonexistent down there, which is either the feature or the problem.',26,16),
  ('KSL','Basement carrels','axr101@case.edu','Best late night option when fourth floor is already full. Outlets everywhere and nobody talking. Bring a layer because the basement runs colder than the rest of KSL.',18,4),
  ('KSL','Freedman Center front tables','hly868@case.edu','Big tables, good for spreading out physical materials and laptops together. Whiteboards on the wall. Gets busy with media projects in the afternoon so mornings are better.',11,14),
  ('KSL','Freedman Center front tables','axr101@case.edu','Solid middle ground between silent and social. You can have a quiet conversation without anyone caring. Not somewhere to take a long phone call though.',9,28),
  ('KSL','Freedman Center front tables','bmt204@case.edu','Good when you need a table and a wall to sketch on. Catch is printers and scanners going off behind you, so it is not a reading spot.',8,6),
  ('Tink','Second floor balcony seating','bmt204@case.edu','Light floods in all afternoon and you can watch the whole building move below you. Food is downstairs. Catch is the noise carries straight up from the atrium.',35,4),
  ('Tink','Second floor balcony seating','cjd318@case.edu','Good for the kind of work where you want ambient life around you rather than silence. Terrible for anything requiring sustained focus, honestly. Know which one you need.',24,11),
  ('Tink','Second floor balcony seating','axr101@case.edu','My between classes default because coffee is one floor down and the light is excellent. Do not come here to write anything you have to reread later.',16,3),
  ('Tink','Ground floor window bar','dnl427@case.edu','Outlets along the whole bar and coffee is thirty seconds away. Great for a ninety minute session between classes. Anything longer and your back will complain.',15,6),
  ('Tink','Ground floor window bar','ekp539@case.edu','Prime people watching, which is exactly the problem if you have real work. Best used when you want to feel productive around others rather than actually concentrate.',30,19),
  ('Tink','Ground floor window bar','axr101@case.edu','Window bar is perfect for answering email and skimming a reading. Catch is every tour group pauses right behind your stool, so focus comes in short bursts.',12,8),
  ('think[box]','Fourth floor open work tables','fhs642@case.edu','Enormous tables, whiteboards everywhere, and nobody minds if you talk through a design. Open very late. Catch is tool noise from the shop floors carries up.',20,8),
  ('think[box]','Fourth floor open work tables','gwm755@case.edu','My default for group work now. Plenty of outlets and the staff leave you alone. Weekends are dead quiet which makes it even better than weekdays.',14,25),
  ('think[box]','Fourth floor open work tables','axr101@case.edu','Best campus table space if your group needs to spread out posters and laptops. Catch is finding parking for your stuff because people leave models overnight.',10,11),
  ('think[box]','Seventh floor corner desks','hly868@case.edu','Almost nobody knows the seventh floor has seating. Quiet, huge windows, and you get the skyline. Catch is exactly one bathroom and a slow elevator.',38,2),
  ('think[box]','Seventh floor corner desks','axr101@case.edu','Closest thing to a private office you will find as an undergrad here. Only a handful of desks though, so it is genuinely luck of the draw.',21,17),
  ('think[box]','Seventh floor corner desks','bmt204@case.edu','Come here when KSL is packed and you still need silence. The view is a bonus. Catch is the building access after hours if you are not already inside.',13,9),
  ('Nord','Third floor hallway alcove','bmt204@case.edu','Two chairs and a small table nobody ever uses, tucked past the lecture halls. Silent between class changes. Catch is the five minutes when it absolutely is not.',12,13),
  ('Nord','Third floor hallway alcove','cjd318@case.edu','Great emergency spot when the library is full and you have an hour to kill. Not a destination, but it has an outlet and it is always free.',7,30),
  ('Nord','Third floor hallway alcove','axr101@case.edu','I duck in here between back to back Nord lectures. Quiet enough to finish a problem set. Catch is there is no real table, just a ledge and two chairs.',9,5),
  ('Olin','First floor lounge','dnl427@case.edu','Comfortable couches and big tables, good for engineering group work where you are all sharing one screen. Gets rowdy in the evenings when clubs meet nearby.',16,10),
  ('Olin','First floor lounge','ekp539@case.edu','Works well for casual collaboration but the couches are a trap if you are already tired. Plenty of outlets, decent lighting, and no one polices noise.',13,23),
  ('Olin','First floor lounge','axr101@case.edu','Fine for reviewing notes with a classmate before lab. Catch is the lounge turns into a club meeting space after five, and then you have to leave.',11,7),
  ('Glennan','Second floor study room','fhs642@case.edu','Whiteboard walls on two sides make it ideal for working through circuits or proofs as a group. First come first served, and it goes fast before exams.',18,7),
  ('Glennan','Second floor study room','gwm755@case.edu','Small room, big whiteboards, door that closes. That combination is rarer on this campus than it should be. Catch is there is exactly one of them.',25,20),
  ('Glennan','Second floor study room','axr101@case.edu','If you can claim it, this room turns a confusing problem set into something you can actually finish. Catch is people hover outside waiting, which adds pressure.',14,3),
  ('Sears','Rear reading room','hly868@case.edu','Old wooden tables and tall windows, feels like a different decade. Very quiet. No outlets anywhere near the good seats, which is the whole catch.',23,5),
  ('Sears','Rear reading room','axr101@case.edu','Beautiful room for reading physical books and taking handwritten notes. Bring a fully charged laptop or accept you are doing analog work today.',10,18),
  ('Sears','Rear reading room','bmt204@case.edu','Best natural light on this side of campus for long reading. Catch is the chairs are wooden and unforgiving, so I never last more than two hours.',12,10),
  ('Sears','3rd floor','axr101@case.edu','Third floor of Sears is quieter than I expected and the tables are actually usable. Catch is outlets are scarce, so charge before you come up here.',8,2),
  ('Sears','3rd floor','bmt204@case.edu','Good overflow when the rear reading room is full. Still pretty calm. The catch is foot traffic between offices, so it is not silent the way KSL fourth is.',15,6),
  ('Sears','3rd floor','cjd318@case.edu','I come here to finish readings between classes in this building. Decent light and almost always a seat. Nothing to eat nearby, so this is a one sitting stop.',11,13),
  ('Millis','Atrium tables','bmt204@case.edu','Bright, open, and there is coffee right there. Good for lighter reading or answering email. The acoustics mean every conversation in the building reaches you.',17,9),
  ('Millis','Atrium tables','cjd318@case.edu','Nice between organic chemistry lectures since you are already in the building. Not where you go to write a paper. Great where you go to not go home.',8,26),
  ('Millis','Atrium tables','axr101@case.edu','Use this for a quick review session, not a deep work block. Catch is the atrium echoes so badly that even headphones only half solve it.',10,4),
  ('Clapp','Second floor bench nook','dnl427@case.edu','A window bench with a view of the quad that somehow stays empty. Quiet, warm in the afternoon sun. No table, so laptop on lap only.',14,15),
  ('Clapp','Second floor bench nook','axr101@case.edu','Lovely for a short reading if you already have class in Clapp. Catch is there is no outlet and no table, so it is phone or thin paperback only.',9,6),
  ('Clapp','Second floor bench nook','bmt204@case.edu','I have written whole discussion posts from this bench because nobody bothers you. Bring a charged laptop and accept that your wrists will hate the angle.',16,22),
  ('Mather Memorial','Third floor seminar corner','ekp539@case.edu','Quiet corner with a small whiteboard and reliable outlets, right outside the seminar rooms. Empty most afternoons. Gets used as overflow during department events.',11,12),
  ('Mather Memorial','Third floor seminar corner','fhs642@case.edu','Underrated. Close to the humanities offices so it stays calm, and the chairs are actually good for long sessions. Nothing nearby if you get hungry.',9,29),
  ('Mather Memorial','Third floor seminar corner','axr101@case.edu','My favorite humanities building hideout. Quiet enough to outline a paper. Catch is you will get asked to move if a seminar needs the overflow chairs.',13,8),
  ('Crawford','Ground floor commons','gwm755@case.edu','Big shared tables and a constant hum of people, good if silence makes you restless. Outlets are plentiful. Coffee line at ten is genuinely disruptive though.',19,6),
  ('Crawford','Ground floor commons','hly868@case.edu','My go to for group problem sets because nobody minds noise and there is always space. Lighting is harsh and there are no windows in the middle.',15,22),
  ('Crawford','Ground floor commons','axr101@case.edu','Works when you need a table for four and do not want to hunt for a library pod. Catch is it is an administrative lobby, so it never fully settles.',12,3),
  ('PBL','Third floor glass overlook','axr101@case.edu','Wall of glass, silent, and the architecture makes you feel like you should be doing something important. Business students dominate it during their exam weeks.',27,4),
  ('PBL','Third floor glass overlook','bmt204@case.edu','One of the prettiest quiet spots on campus and the light is incredible until sunset. Catch is that it is a long walk from anywhere on north side.',22,16),
  ('PBL','Third floor glass overlook','cjd318@case.edu','I will cross campus for this light when I have a paper due. Quiet and outlets along the wall. Catch is the glass turns it into a greenhouse on warm afternoons.',18,1),
  ('PBL','Basement team rooms','cjd318@case.edu','Bookable rooms with whiteboards and a door, open late during the semester. If you can get one, group work becomes twice as fast. That is the catch.',31,8),
  ('PBL','Basement team rooms','dnl427@case.edu','Genuinely the best group space I have used here, but the booking system means undergrads outside Weatherhead rarely get a slot. Worth trying anyway.',16,24),
  ('PBL','Basement team rooms','axr101@case.edu','When you luck into a room, it is the most focused group environment on campus. Catch is walking in to find it already claimed with no sign on the door.',14,5),
  ('Wolstein','Second floor atrium','ekp539@case.edu','Quiet in a way medical buildings tend to be, with good natural light and plenty of outlets. Long walk from main campus unless you already have class nearby.',13,11),
  ('Wolstein','Second floor atrium','fhs642@case.edu','Almost always empty in the afternoon which makes it reliable when everything else is packed. Nothing to eat nearby, so plan around that or bring food.',10,27),
  ('Wolstein','Second floor atrium','axr101@case.edu','Reliable when KSL and Tink are impossible. Quiet, outlets, actual chairs. Catch is the walk, and you will not run into anyone you know, which can feel isolating.',17,9),
  ('Samson','Fourth floor pavilion seating','gwm755@case.edu','Newest building on campus and it shows. Quiet, bright, open late, and outlets everywhere. Catch is the shuttle ride if you are not already at the health campus.',29,5),
  ('Samson','Fourth floor pavilion seating','hly868@case.edu','Feels like working in an airport lounge in the best way. Very calm even at night. Nursing and med students fill it during their block exam weeks.',18,14),
  ('Samson','Fourth floor pavilion seating','axr101@case.edu','Worth the shuttle if you want a full evening of quiet work with outlets and light. Catch is getting back to north side after the last shuttle, so time it.',15,7),
  ('Allen','Main reading room','axr101@case.edu','Historic reading room that stays genuinely silent, with beautiful light in the morning. Limited hours compared to KSL and outlets are scarce at the long tables.',21,10),
  ('Allen','Main reading room','bmt204@case.edu','Worth the walk if you want somewhere that feels serious. Not practical for a full day since it closes earlier than you will want it to.',12,25),
  ('Allen','Main reading room','cjd318@case.edu','I come here when I need a room that makes me sit up straight and actually read. Catch is the hours, and you cannot really eat or even whisper.',14,6),
  ('Thwing','Upstairs ballroom overlook','cjd318@case.edu','Quiet upstairs seating overlooking the ballroom, with food downstairs when you need a break. Gets closed off without warning whenever an event is booked.',15,9),
  ('Thwing','Upstairs ballroom overlook','dnl427@case.edu','Nice light and almost nobody up there most days. Check the event calendar first or you will carry your laptop back down the stairs for nothing.',8,20),
  ('Thwing','Upstairs ballroom overlook','axr101@case.edu','Good for a calm afternoon if Thwing is not hosting something. Catch is you only find out it is closed when you are already at the top of the stairs.',11,4),
  ('Leutner','Late night dining tables','ekp539@case.edu','Open late with food right there, which during finals is the only thing that matters. Loud and bright, so bring headphones and low expectations for focus.',24,6),
  ('Leutner','Late night dining tables','fhs642@case.edu','Good for the eleven pm shift when everything else is closed and you need caffeine within reach. Tables get sticky and staff start cleaning around you.',17,18),
  ('Leutner','Late night dining tables','axr101@case.edu','This is survival studying, not deep work. Food and outlets and other people still awake. Catch is it is a dining hall, so it never stops smelling like dinner.',13,2),
  ('Fribley','Back corner booths','gwm755@case.edu','Booths in the back are surprisingly private for a dining hall, and there are outlets along that wall. Empties out completely after the dinner rush ends.',14,12),
  ('Fribley','Back corner booths','hly868@case.edu','Solid south side option if you live down there and do not want to walk. Peak meal times are unusable, but the gap hours are genuinely fine.',9,26),
  ('Fribley','Back corner booths','axr101@case.edu','I do problem sets in the back booths after dinner when it is just staff and a few people left. Catch is you have to time it around the meal rush.',12,8),
  ('Mather','Fireplace lounge','axr101@case.edu','Quiet lounge with a fireplace and good afternoon light, the kind of place you read in rather than grind in. No outlets near the comfortable chairs.',20,7),
  ('Mather','Fireplace lounge','bmt204@case.edu','Lovely for reading and terrible for anything with a deadline, because you will fall asleep in those chairs. I say that from direct personal experience.',26,21),
  ('Mather','Fireplace lounge','cjd318@case.edu','Come here with a novel or a light reading assignment, not a problem set. Catch is the comfy chairs plus the fireplace make it almost impossible to stay sharp.',15,11),
  ('Adelbert','Second floor corridor seats','cjd318@case.edu','A few seats along the corridor that stay quiet because it is mostly administrative offices. Outlets are there. Nothing scenic, but it is dependably empty.',7,15),
  ('Adelbert','Second floor corridor seats','axr101@case.edu','Useful if you have a meeting in Adelbert and need thirty quiet minutes first. Catch is it feels like waiting outside an office, because that is what it is.',10,9),
  ('Adelbert','Second floor corridor seats','bmt204@case.edu','I have finished quizzes sitting here because it is always free. Not a place you would choose, but it has an outlet and nobody talks in this hallway.',14,19),
  ('Veale','Upper concourse tables','dnl427@case.edu','Tables above the courts, open late, and the background noise of practice is weirdly good for grinding through problem sets. Not for reading anything subtle.',13,8),
  ('Veale','Upper concourse tables','ekp539@case.edu','Useful if you are already there for a workout and want to knock out an hour. Gets genuinely loud during home games, which is entirely predictable.',11,23),
  ('Veale','Upper concourse tables','axr101@case.edu','I study here after climbing because I am already in the building. Catch is game days and the occasional whistle echoing up, so check the athletics calendar.',16,5),
  ('KHS','Fifth floor lab annex desks','fhs642@case.edu','Quiet desks near the labs that graduate students use, and undergrads are welcome. Open late, outlets everywhere. Almost no signage so it is hard to find first time.',16,5),
  ('KHS','Fifth floor lab annex desks','gwm755@case.edu','Best kept secret for anyone in the sciences who wants silence without walking to the library. Fluorescent lighting is rough after a couple of hours.',22,17),
  ('KHS','Fifth floor lab annex desks','axr101@case.edu','If you can find the annex, it is a reliable late night desk with real outlets. Catch is you will feel like you wandered into a lab you should not be in.',12,3),
  ('Gund','Library reading tables','axr101@case.edu','Law library tables are quiet in a professional way and the light is good. Catch is you feel slightly out of place as an undergrad, and hours are stricter than KSL.',27,4),
  ('Gund','Library reading tables','bmt204@case.edu','Best quiet tables I have found off the main quad. Outlets at the carrels. Catch is you should not eat, and the staff will remind you if you forget.',19,12),
  ('Gund','Library reading tables','cjd318@case.edu','I come here when I need to be around people who are taking work seriously. Silent, clean, outlets. The walk from north side is the tax you pay for that.',21,8),
  ('Bellflower','First floor study lounge','dnl427@case.edu','Small lounge with real tables and decent light, good for a group of three. Catch is it is in a residential building, so it can turn social without warning.',14,6),
  ('Bellflower','First floor study lounge','ekp539@case.edu','Convenient if you live nearby and do not want to cross campus at night. Outlets work. Not quiet enough for reading anything that needs full attention.',13,18),
  ('Bellflower','First floor study lounge','fhs642@case.edu','I have done whole problem sets here with two friends and nobody cared that we talked. Catch is residents treat it like a living room after nine.',11,10),
  ('Haydn','Second floor window seats','gwm755@case.edu','Window seats with a view and almost no traffic. Quiet enough to read theory. Catch is there is barely a table surface, so this is laptop on knees territory.',17,7),
  ('Haydn','Second floor window seats','hly868@case.edu','A hidden quiet corner in a music building, which sounds wrong and is somehow true between rehearsals. Catch is when rehearsal lets out the hallway fills instantly.',15,15),
  ('Haydn','Second floor window seats','axr101@case.edu','Beautiful light in the afternoon and usually empty. I outline papers here. Bring a charger because I have not found a reliable outlet next to the good seat.',16,2),
  ('Mandel School','Atrium seating','bmt204@case.edu','Open atrium with tables and enough light to skip overhead fluorescents. Good for group discussion. Catch is every voice carries, so it is collaboration only.',12,9),
  ('Mandel School','Atrium seating','cjd318@case.edu','I use this between classes on this side of campus. Plenty of seats and outlets along the walls. Not a destination if you need to disappear into a book.',14,21),
  ('Mandel School','Atrium seating','dnl427@case.edu','Solid tables and a calm crowd compared with Tink. Catch is it empties out so hard in the evening that it starts to feel closed even when it is not.',13,5),
  ('Tomlinson','Lobby study tables','ekp539@case.edu','Lobby tables with outlets and a constant stream of people, which I oddly need in order to start work. Catch is it is a lobby, so focus has a short half life.',18,6),
  ('Tomlinson','Lobby study tables','fhs642@case.edu','Fine for a short session before a meeting in this building. Not where I would take an exam review. Lighting is harsh and the chairs are waiting room chairs.',16,14),
  ('Tomlinson','Lobby study tables','gwm755@case.edu','I stop here to knock out email and a reading quiz. Catch is you will be interrupted by someone you know, because everyone walks through this lobby.',12,3),
  ('Rock','Third floor alcove','hly868@case.edu','A quiet alcove with an outlet and almost no signage, which is why it stays empty. Good for a focused hour. Catch is the building itself is easy to get lost in.',19,8),
  ('Rock','Third floor alcove','axr101@case.edu','I found this by accident and now I guard it. Silent between classes. Catch is there is only room for two, so a third person makes it awkward fast.',15,16),
  ('Rock','Third floor alcove','bmt204@case.edu','Useful when you have class in Rockefeller and need a hole to crawl into. Outlets work. Nothing pretty about it, and that is why it stays available.',14,11),
  ('Harkness','Narthex seating','cjd318@case.edu','Quiet in the way a chapel entrance is quiet. Good light, good for reading. Catch is you should not treat it like a library, and events will boot you out.',17,7),
  ('Harkness','Narthex seating','dnl427@case.edu','I have done some of my calmest reading here. No outlets that I could find. Come with a charged laptop or a paper book and leave when a rehearsal starts.',16,19),
  ('Harkness','Narthex seating','ekp539@case.edu','Beautiful and almost always empty on weekday afternoons. Catch is it is still a chapel, so talking through a problem set here feels wrong and probably is.',14,4),
  ('Maltz','Lobby window seats','fhs642@case.edu','Window seats in the Maltz lobby with great light and a hush that the building seems to enforce. Catch is performance nights, when the lobby stops being yours.',15,9),
  ('Maltz','Lobby window seats','gwm755@case.edu','A surprisingly good place to read if you are already at the far end of campus. Quiet, pretty, limited outlets. Check the performance calendar before you commit.',16,13),
  ('Maltz','Lobby window seats','hly868@case.edu','I like this for a one hour reading block with a view. Catch is you will get swept up in ushers and patrons the moment a show is about to start.',14,1)
) as v(building_short, area_name, author_email, body, expands, age_days)
join public.buildings b on b.short_name = v.building_short
join public.spots s     on s.building_id = b.id and s.area_name = v.area_name
join auth.users u       on u.email = v.author_email
where not exists (
  select 1 from public.reviews r
  where r.spot_id = s.id and r.author_id = u.id
);

-- A spot's creator is the author of its first review. Only fill blanks so the
-- student-created Sears 3rd floor keeps its real created_by.
update public.spots s
   set created_by = first_review.author_id
from (
  select distinct on (spot_id) spot_id, author_id
  from public.reviews
  order by spot_id, created_at asc
) as first_review
where first_review.spot_id = s.id
  and s.created_by is null;

select
  (select count(*) from public.spots) as spots,
  (select count(*) from public.reviews) as reviews,
  (select count(*) from public.reviews where embedding is null) as unembedded;
