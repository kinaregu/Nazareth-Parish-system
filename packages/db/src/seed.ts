/**
 * @nazareth/db — development/demo seed data.
 *
 * Everything generated here is REALISTIC demo data, clearly marked:
 *  - generated rows carry is_demo = true where the column exists
 *  - demo emails use @demo.example / example.com addresses
 *  - documented demo logins live in README.md
 *
 * Run: npm run db:seed   (requires a migrated, empty dev database)
 */
import { pool, query, queryOne, tx, closePool } from './pool';
import { loadEnv } from './env';
loadEnv();

// Relative import keeps the dependency direction clean (core depends on db,
// never the reverse) while reusing the canonical password implementation.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hashPassword } = require('../../core/src/auth/passwords') as typeof import('../../core/src/auth/passwords');

/* deterministic PRNG so the seed is reproducible */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260826);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;

const FIRST = ['Grace', 'Peter', 'Mary', 'John', 'Esther', 'David', 'Ruth', 'Samuel', 'Hannah', 'Daniel', 'Rebecca', 'Joseph', 'Sarah', 'Nathaniel', 'Lydia', 'Andrew', 'Deborah', 'James', 'Priscilla', 'Timothy', 'Naomi', 'Caleb', 'Abigail', 'Isaac', 'Miriam', 'Eli', 'Ruth', 'Moses', 'Leah', 'Solomon', 'Joy', 'Peace', 'Faith', 'Hope', 'Love', 'Mercy', 'Blessing', 'Victory', 'Kingsley', 'Amara'];
const LAST = ['Okello', 'Kiprop', 'Musinguzi', 'Ochieng', 'Achieng', 'Odwari', 'Tandui', 'Achol', 'Jok', 'Duang', 'Gad', 'Maber', 'Laru', 'Yar', 'Gai', 'Kuch', 'Ruong', 'Kor', 'Kwo', 'Majok', 'Bol', 'Gai', 'Yat', 'Nyang', 'Wet', 'Garang', 'Deo', 'Mony', 'Kolo', 'Rim'];

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(int(9, 17), pick([0, 30]), 0, 0);
  return d.toISOString();
};

async function main() {
  console.log('Seeding Nazareth Parish ChMS…');
  const orgId = (await query<string[]>('SELECT id FROM organizations LIMIT 1'))[0];
  if (orgId) {
    console.log('Organization already present — assuming a fresh seed run is required. Aborting.');
    process.exit(1);
  }

  await tx(async (t) => {
    /* ── Organization ── */
    const org = await t.query(
      `INSERT INTO organizations (id, name, slug, address, phone, email, website, country, timezone, currency, date_format, default_language, settings)
       VALUES (gen_random_uuid(), 'Nazareth Parish Church', 'nazareth-parish',
               'P.O. Box 1234, Juba', '+211 920 000 111', 'office@nazarethparish.org', 'https://nazarethparish.org',
               'South Sudan', 'Africa/Juba', 'SSP', 'DD/MM/YYYY', 'en',
               '{"member_self_view_giving": true, "member_editable_fields": ["preferred_name","phone","email","address","city","country"]}')
       RETURNING id`,
    );
    const O = org[0].id as string;

    /* ── Branches ── */
    const branchMain = (await t.query(
      `INSERT INTO branches (org_id, code, name, is_primary, address, phone, email) VALUES ($1,'MAIN','Main Campus',true,'Juba City Centre','+211 920 000 111','main@nazarethparish.org') RETURNING id`, [O]))[0].id;
    const branchEast = (await t.query(
      `INSERT INTO branches (org_id, code, name, is_primary, address, phone, email) VALUES ($1,'EAST','Eastside Campus',false,'Juba East','+211 920 000 222','east@nazarethparish.org') RETURNING id`, [O]))[0].id;

    /* ── Permissions + Roles ── */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PERMISSIONS, SYSTEM_ROLES, DEFAULT_ROLE_PERMISSIONS, DEFAULT_MEMBER_STATUSES } =
      require('../../shared/src/index') as typeof import('../../shared/src/index');
    for (const p of PERMISSIONS) {
      await t.query('INSERT INTO permissions (code, label, module, description) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING',
        [p.code, p.label, p.module, p.description ?? null]);
    }
    const permIds: Record<string, string> = {};
    for (const r of await t.query('SELECT id, code FROM permissions')) permIds[r.code] = r.id;
    const roleIds: Record<string, string> = {};
    for (const r of SYSTEM_ROLES) {
      const row = await t.query('INSERT INTO roles (org_id, code, name, description, is_system) VALUES ($1,$2,$3,$4,true) RETURNING id',
        [O, r.code, r.name, r.description]);
      roleIds[r.code] = row[0].id;
    }
    for (const [code, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const list = perms.includes('*') ? Object.keys(permIds) : perms;
      for (const pc of list) {
        if (permIds[pc]) await t.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roleIds[code], permIds[pc]]);
      }
    }

    /* ── Membership status defs ── */
    for (const s of DEFAULT_MEMBER_STATUSES) {
      await t.query('INSERT INTO member_status_defs (org_id, code, name, color, is_system) VALUES ($1,$2,$3,$4,true)',
        [O, s.code, s.name, s.color]);
    }

    /* ── Users ─ */
    const hash = await hashPassword('Password123');
    const users: Record<string, string> = {};
    const mkUser = async (key: string, name: string, email: string, roles: string[], branch: string, phone?: string, memberId?: string) => {
      const id = (await t.query(
        `INSERT INTO users (org_id, branch_id, name, email, phone, password_hash, email_verified_at, member_id)
         VALUES ($1,$2,$3,$4,$5,$6,now(),$7) RETURNING id`,
        [O, branch, name, email, phone ?? null, hash, memberId ?? null],
      ))[0].id as string;
      for (const r of roles) {
        await t.query('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, roleIds[r], branch]);
      }
      users[key] = id;
      return id;
    };

    // Linked member ids are created later; we create users first and link after members.
    const linkedPlaceholder: { key: string; idx: number }[] = [
      { key: 'youth', idx: 5 }, { key: 'worship', idx: 8 }, { key: 'cell1', idx: 12 },
      { key: 'cell2', idx: 15 }, { key: 'member1', idx: 20 }, { key: 'member2', idx: 22 },
    ];
    mkUser('super', 'Abraham Okello', 'superadmin@nazarethparish.org', ['super_admin'], branchMain, '+211 920 100 001');
    mkUser('pastor', 'Pastor Samuel Kiprop', 'pastor@nazarethparish.org', ['pastor'], branchMain, '+211 920 100 002');
    mkUser('secretary', 'Ruth Musinguzi', 'secretary@nazarethparish.org', ['admin'], branchMain, '+211 920 100 003');
    mkUser('finance', 'Peter Ochieng', 'finance@nazarethparish.org', ['finance'], branchMain, '+211 920 100 004');
    mkUser('youth', 'Daniel Achol', 'youth.leader@nazarethparish.org', ['ministry_leader'], branchMain);
    mkUser('worship', 'Lydia Gad', 'worship.leader@nazarethparish.org', ['ministry_leader'], branchMain);
    mkUser('cell1', 'James Majoc', 'cell.leader1@nazarethparish.org', ['group_leader'], branchMain);
    mkUser('cell2', 'Grace Kor', 'cell.leader2@nazarethparish.org', ['group_leader'], branchEast);
    mkUser('member1', 'Mercy Wet', 'member@nazarethparish.org', ['member'], branchMain);
    mkUser('member2', 'Hope Deo', 'member2@nazarethparish.org', ['member'], branchEast);
    mkUser('visitor', 'Visitor Guest', 'visitor@demo.example', ['visitor'], branchMain);

    /* ── Members (160) ── */
    const memberIds: string[] = [];
    const familyIds: string[] = [];
    for (let i = 0; i < 16; i++) {
      const fam = (await t.query(
        `INSERT INTO families (org_id, branch_id, name, address, city, country, phone, email, is_demo)
         VALUES ($1,$2,$3,$4,'Juba','South Sudan',$5,$6,true) RETURNING id`,
        [O, chance(0.8) ? branchMain : branchEast, `${pick(LAST)} Family`, `Street ${int(1, 90)}, Juba`, `+211 9${int(10000000, 99999999)}`, `family${i + 1}@demo.example`],
      ))[0].id as string;
      familyIds.push(fam);
    }

    const genderPool = ['male', 'female', 'female', 'male', 'other'] as const;
    for (let i = 0; i < 160; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const gender = pick([...genderPool]);
      const age = int(4, 82);
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - age);
      dob.setMonth(int(0, 11), int(1, 28));
      const branch = chance(0.8) ? branchMain : branchEast;
      const statusRoll = rnd();
      const status = statusRoll < 0.72 ? 'active' : statusRoll < 0.82 ? 'new_member' : statusRoll < 0.88 ? 'inactive' : statusRoll < 0.93 ? 'visitor' : statusRoll < 0.97 ? 'transferred' : 'moved_away';
      const joined = daysAgo(int(30, 1100));
      const row = await t.query(
        `INSERT INTO members (org_id, branch_id, member_no, first_name, last_name, gender,
           date_of_birth, phone, email, address, city, country, status, member_type, date_joined, first_attendance,
           baptism_status, baptism_date, confirmation_status, previous_church, skills, interests, volunteer, notes, is_demo, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Juba','South Sudan',$11,'regular',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,true,$22) RETURNING id`,
        [O, branch, `NPH-${String(i + 1).padStart(4, '0')}`, first, last, gender, dob.toISOString().slice(0, 10),
          `+211 9${int(10000000, 99999999)}`, `${first}.${last}.${i + 1}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@demo.example',
          `Street ${int(1, 90)}`, status, joined, daysAgo(int(10, 1100)),
          chance(0.6) ? 'baptized' : 'none', chance(0.6) ? daysAgo(int(30, 900)) : null,
          chance(0.2) ? 'confirmed' : 'none', chance(0.3) ? pick(['First Baptist Juba', 'Grace Community Church', 'Nairobi Central Church']) : null,
          JSON.stringify(chance(0.4) ? [pick(['Music', 'Teaching', 'Cooking', 'Tech', 'Counselling'])] : []),
          JSON.stringify(chance(0.5) ? [pick(['Youth', 'Choir', 'Missions', 'Prayer', 'Hospitality'])] : []),
          chance(0.35), chance(0.1) ? 'Needs prayer this month.' : null, users.secretary],
      );
      const m = row[0].id as string;
      memberIds.push(m);
      // 60% belong to a family
      if (chance(0.6) && familyIds.length) {
        const fam = pick(familyIds);
        await t.query("INSERT INTO family_members (family_id, member_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          [fam, m, i % 4 === 0 ? 'head' : i % 4 === 1 ? 'spouse' : 'child']);
      }
      if (chance(0.5)) {
        await t.query('INSERT INTO member_status_changes (member_id, to_status, changed_by) VALUES ($1,$2,$3)', [m, status, users.secretary]);
      }
    }

    // Link users to members
    for (const l of linkedPlaceholder) {
      const m = memberIds[l.idx];
      await t.query('UPDATE members SET user_id = $2 WHERE id = $1', [m, users[l.key]]);
      await t.query('UPDATE users SET member_id = $2 WHERE id = $1', [users[l.key], m]);
    }

    /* ── Ministries (10) + memberships ── */
    const ministryDefs = [
      ['Youth Ministry', 'youth', memberIds[5], 6], ['Children’s Ministry', 'children', memberIds[10], 12],
      ['Men’s Fellowship', 'men', memberIds[14], 8], ['Women’s Fellowship', 'women', memberIds[18], 9],
      ['Worship Team', 'worship', memberIds[8], 7], ['Choir', 'choir', memberIds[25], 11],
      ['Ushering', 'ushering', memberIds[30], 16], ['Media & Tech', 'media', memberIds[33], 8],
      ['Evangelism', 'evangelism', memberIds[36], 7], ['Prayer & Missions', 'missions', memberIds[40], 9],
    ];
    const ministryIdsList: string[] = [];
    for (const [name, , leader, size] of ministryDefs) {
      const m = (await t.query(
        `INSERT INTO ministries (org_id, branch_id, name, description, leader_id, meeting_day, meeting_time, location, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
        [O, branchMain, name, `${name} of Nazareth Parish Church`, leader, pick(['Sunday', 'Wednesday', 'Friday', 'Saturday']), pick(['09:00', '17:00', '18:00', '19:00']), 'Main Hall'],
      ))[0].id as string;
      ministryIdsList.push(m);
      await t.query("INSERT INTO ministry_members (ministry_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT DO NOTHING", [m, leader]);
      for (let i = 0; i < size; i++) {
        const mem = pick(memberIds);
        if (mem !== leader) await t.query("INSERT INTO ministry_members (ministry_id, member_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", [m, mem]);
      }
    }

    /* ── Departments (5) ── */
    const deptDefs: [string, string, string][] = [
      ['Finance & Administration', 'Bookkeeping, records, office', memberIds[28]],
      ['Facilities & Grounds', 'Building, cleaning, maintenance', memberIds[45]],
      ['Communications', 'Website, social media, bulletins', memberIds[48]],
      ['Hospitality', 'Reception, care for guests', memberIds[51]],
      ['Security', 'Parking, safety during services', memberIds[54]],
    ];
    const deptIds: string[] = [];
    for (const [name, resp, leader] of deptDefs) {
      const d = (await t.query(
        `INSERT INTO departments (org_id, branch_id, name, description, leader_id, responsibilities, is_demo) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
        [O, branchMain, name, name, leader, resp],
      ))[0].id as string;
      deptIds.push(d);
      await t.query("INSERT INTO department_members (department_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT DO NOTHING", [d, leader]);
      for (let i = 0; i < 5; i++) {
        await t.query("INSERT INTO department_members (department_id, member_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", [d, pick(memberIds)]);
      }
    }

    /* ── Groups (10) ── */
    const groupNames = ['Grace Cell', 'Hope Cell', 'Faith Cell', 'Olive Branch', 'New Beginnings', 'Riverside Group', 'Momentum', 'Legacy Group', 'Crossing Point', 'Jubilee Group'];
    const groupIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const leader = i === 0 ? memberIds[12] : i === 5 ? memberIds[15] : memberIds[60 + i * 4];
      const g = (await t.query(
        `INSERT INTO groups (org_id, branch_id, name, type, description, leader_id, location, meeting_day, meeting_time, is_demo)
         VALUES ($1,$2,$3,'cell',$4,$5,$6,$7,$8,true) RETURNING id`,
        [O, i < 5 ? branchMain : branchEast, groupNames[i], `${groupNames[i]} — weekly midweek fellowship`, leader,
          pick(['Member’s home', 'Community hall', 'Parish hall']), pick(['Monday', 'Tuesday', 'Wednesday', 'Thursday']), pick(['19:00', '19:30', '20:00'])],
      ))[0].id as string;
      groupIds.push(g);
      await t.query("INSERT INTO group_members (group_id, member_id, role) VALUES ($1,$2,'leader') ON CONFLICT DO NOTHING", [g, leader]);
      for (let j = 0; j < int(6, 14); j++) {
        const mem = pick(memberIds);
        await t.query("INSERT INTO group_members (group_id, member_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", [g, mem]);
      }
    }

    /* ── Services ── */
    const svc = async (branch: string, name: string, category: string, dow: number, time: string, loc: string) =>
      (await t.query('INSERT INTO services (org_id, branch_id, name, category, day_of_week, time, location) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [O, branch, name, category, dow, time, loc]))[0].id as string;
    const sundayMain = await svc(branchMain, 'Sunday Service', 'sunday', 0, '09:00', 'Main Hall');
    const midweekMain = await svc(branchMain, 'Midweek Service', 'midweek', 3, '18:30', 'Main Hall');
    const youthSvc = await svc(branchMain, 'Youth Gathering', 'youth', 6, '17:00', 'Youth Centre');
    const childrenSvc = await svc(branchMain, 'Children’s Church', 'children', 0, '09:00', 'Children’s Room');
    const studySvc = await svc(branchMain, 'Bible Study', 'bible_study', 2, '10:00', 'Fellowship Hall');
    const sundayEast = await svc(branchEast, 'Sunday Service (Eastside)', 'sunday', 0, '10:00', 'Eastside Hall');

    /* ── Attendance: last 10 weeks × (sunday, midweek) ── */
    const sundayIds = [sundayMain, sundayEast];
    const midweekIds = [midweekMain];
    const activeMembers = memberIds;
    for (let w = 10; w >= 1; w--) {
      const sDate = new Date();
      sDate.setDate(sDate.getDate() - w * 7);
      const mDate = new Date(sDate);
      mDate.setDate(mDate.getDate() + 3);
      for (const [sid, date] of [[sundayMain, sDate], [sundayEast, sDate], [midweekMain, mDate]] as [string, Date][]) {
        const sess = (await t.query(
          'INSERT INTO attendance_sessions (org_id, branch_id, service_id, session_date, recorded_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (service_id, session_date) DO NOTHING RETURNING id',
          [O, sid === sundayEast ? branchEast : branchMain, sid, date.toISOString().slice(0, 10), users.secretary],
        ))[0];
        if (!sess) continue;
        const sid2 = sess.id as string;
        for (const m of activeMembers) {
          const member = (await t.query('SELECT branch_id, status FROM members WHERE id = $1', [m]))[0];
          if (!member) continue;
          if (member.branch_id !== (sid === sundayEast ? branchEast : branchMain)) continue;
          if (member.status !== 'active' && member.status !== 'new_member') continue;
          const roll = rnd();
          const status = roll < 0.72 ? 'present' : roll < 0.80 ? 'excused' : roll < 0.92 ? 'absent' : 'present';
          await t.query(
            'INSERT INTO attendance_records (session_id, member_id, status, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
            [sid2, m, status, users.secretary],
          );
        }
      }
    }

    /* ── Events (9) ── */
    const events: string[] = [];
    const eventDefs: [string, string, number, string, string, string, boolean, string | null, string | null, string][] = [
      ['Annual Parish Picnic', 'public', 21, 'River Park', 'All are welcome!', 'members', true, null, null, branchMain],
      ['Midweek Revival Night', 'members', 9, 'Main Hall', 'A night of worship and the Word.', 'members', true, null, null, branchMain],
      ['Youth Day Camp', 'public', 16, 'Hilltop Retreat', 'Fun, games and growth for youth 13+.', 'members', true, ministryIdsList[0], null, branchMain],
      ['Newcomers’ Welcome Tea', 'public', 6, 'Fellowship Hall', 'Meet the church family over tea.', 'members', false, null, null, branchMain],
      ['Women’s Fellowship Retreat', 'public', 30, 'Lake View Lodge', 'Two days of fellowship and refreshment.', 'group', true, null, groupIds[1], branchMain],
      ['Choir Concert — Songs of Hope', 'public', 13, 'Town Theatre', 'An evening of choral worship, free entry.', 'public', false, null, null, branchMain],
      ['Cell Leaders Training', 'members', 4, 'Fellowship Hall', 'Practical training for small-group leaders.', 'group', true, null, groupIds[0], branchMain],
      ['Eastside Community Outreach', 'public', 11, 'Juba East Square', 'Health checks, prayer and community service.', 'public', false, null, null, branchEast],
      ['Baptism Service', 'public', -7, 'Main Hall', 'We celebrated 12 new believers in Christ.', 'members', false, null, null, branchMain],
    ];
    for (const [title, visibility, offset, loc, desc, vis2, reg, minId, grpId, branch] of eventDefs) {
      const status = offset < 0 ? 'completed' : 'published';
      const starts = offset < 0 ? daysAgo(-offset) + 'T10:00:00.000Z' : daysAhead(offset);
      const e = (await t.query(
        `INSERT INTO events (org_id, branch_id, title, description, starts_at, ends_at, location, capacity, registration_required,
           status, visibility, ministry_id, group_id, organizer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [O, branch, title, desc, starts, offset < 0 ? daysAgo(-offset) + 'T13:00:00.000Z' : null, loc,
          pick([null, 50, 100, 200]), reg, status, vis2, minId, grpId, users.secretary],
      ))[0].id as string;
      events.push(e);
      if (reg) {
        const count = int(8, 35);
        for (let i = 0; i < count; i++) {
          await t.query(
            "INSERT INTO event_registrations (event_id, member_id, user_id, status) VALUES ($1,$2,$3,'registered') ON CONFLICT (event_id, member_id) DO NOTHING",
            [e, pick(memberIds), users.member1],
          );
        }
      }
    }

    /* ── Announcements (6) ── */
    const ann = async (title: string, content: string, status: string, audience: any, pubDaysAgo: number, expires?: string) =>
      await t.query(
        `INSERT INTO announcements (org_id, branch_id, title, content, audience, status, publish_at, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,now() - (${pubDaysAgo} || ' days')::interval,$7,$8) RETURNING id`,
        [O, branchMain, title, content, JSON.stringify(audience), status, expires ?? null, users.secretary],
      );
    await ann('Easter Preparation Begins', 'The church family is invited to the Lenten midweek services every Wednesday at 18:30. Come and prepare your heart for the resurrection of our Lord.', 'published', { type: 'all' }, 3);
    await ann('Youth Day Camp Volunteers Needed', 'Youth Day Camp needs 12 volunteers for games, cooking and first aid. Sign up with the Youth Ministry office before Friday.', 'published', { type: 'ministry', ministry_id: ministryIdsList[0] }, 2);
    await ann('Building Fund Update', 'Thank you for your generosity! The building fund has reached 62% of its target. A full financial report will be shared at the midweek service.', 'published', { type: 'all' }, 1);
    await ann('Cell Group Meeting Rescheduled', 'All cell groups: this week’s meetings are moved to 20:00 due to the outreach.', 'scheduled', { type: 'all' }, 0);
    await ann('Media Team Meeting Notes', 'Slides for next Sunday are due to the media desk by Wednesday evening.', 'draft', { type: 'ministry', ministry_id: ministryIdsList[7] }, 0);
    await ann('January Special Offering', 'The special offering for the building project was a success. God bless every giver.', 'expired', { type: 'all' }, 40, daysAgo(5));

    /* ── Message templates (8) ── */
    const templates: [string, string, string, string, string][] = [
      ['welcome_member', 'Welcome to Nazareth Parish', 'email', 'Welcome to the family of God', 'Dear {{name}},\n\nWelcome to Nazareth Parish Church! We are so glad you are part of our family. Our leadership team would love to meet you — look out for a welcome call from your assigned mentor.\n\nIn His service,\nNazareth Parish Church'],
      ['new_member_account', 'Your Nazareth Parish account', 'email', 'Welcome to Nazareth Parish — your account', 'Dear {{name}},\n\nYour member account is ready.\nEmail: {{email}}\nTemporary password: {{password}}\n\nPlease sign in and change your password at first login.\n\nNazareth Parish Administration'],
      ['welcome_visitor', 'Welcome, we’d love to see you again', 'email', 'Welcome to Nazareth Parish', 'Dear {{name}},\n\nThank you for visiting us. We hope it was a blessing. If you have any questions, reply to this email any time.\n\nNazareth Parish Church'],
      ['birthday', 'Happy birthday!', 'email', 'Happy birthday, {{name}}!', 'Dear {{name}},\n\nWishing you a joyful birthday filled with God’s blessings. We are praying for you and your family.\n\nWith love,\nNazareth Parish Church'],
      ['anniversary', 'Happy anniversary', 'email', 'Happy anniversary, {{name}}!', 'Dear {{name}},\n\nCongratulations on your anniversary! May God continue to bless your marriage.\n\nNazareth Parish Church'],
      ['event_reminder', 'Event reminder', 'email', 'Reminder: {{event}}', 'Dear {{name}},\n\nA friendly reminder that {{event}} takes place on {{date}} at {{location}}.\n\nSee you there!\nNazareth Parish Church'],
      ['attendance_followup', 'We miss you', 'sms', 'Attendance follow-up', 'Hi {{name}}, this is Nazareth Parish. We’ve missed you in worship and would love to check in. Call us at +211 920 000 111.'],
      ['giving_receipt', 'Giving receipt', 'email', 'Giving receipt {{receipt}}', 'Dear {{name}},\n\nThank you for your gift of {{amount}} to the {{fund}} on {{date}}.\n\nReceipt: {{receipt}}\n\nWith gratitude,\nNazareth Parish Finance Office'],
    ];
    for (const [code, name, channel, subject, body] of templates) {
      await t.query('INSERT INTO message_templates (org_id, code, name, channel, subject, body, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (org_id, code) DO NOTHING',
        [O, code, name, channel, subject, body, users.secretary]);
    }

    /* ── Pastoral cases (6) + notes ── */
    const caseDefs: [string, string, string, string][] = [
      ['Counseling — job stress', 'counseling', 'open', memberIds[70]],
      ['Hospital visit — Mrs. Ochieng', 'hospital_visit', 'in_progress', memberIds[72]],
      ['Bereavement — loss of spouse', 'bereavement', 'in_progress', memberIds[75]],
      ['Marriage support — young couple', 'marriage_support', 'open', memberIds[78]],
      ['Home visit — elderly member', 'home_visit', 'resolved', memberIds[80]],
      ['Crisis support — family conflict', 'crisis_support', 'closed', memberIds[83]],
    ];
    for (const [title, type, status, mem] of caseDefs) {
      const c = (await t.query(
        `INSERT INTO pastoral_cases (org_id, branch_id, member_id, type, title, status, assigned_to, resolution, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
        [O, branchMain, mem, type, title, status, users.pastor, status === 'closed' ? 'Member stable; referred to group for ongoing support.' : null],
      ))[0].id as string;
      for (let i = 0; i < int(1, 3); i++) {
        await t.query(
          "INSERT INTO pastoral_notes (case_id, by_user, body, sensitive) VALUES ($1,$2,$3,true)",
          [c, users.pastor, pick(['Visited the family; prayed together. Requested continued prayer.', 'Spoke by phone — things are improving. Will revisit next week.', 'Coordinated with the cell group for midweek visit.', 'Hospital visit made; family is grateful.'])],
        );
      }
    }

    /* ── Prayer requests (14) ── */
    for (let i = 0; i < 14; i++) {
      const vis = pick(['private', 'private', 'pastoral', 'church', 'ministry', 'group'] as const);
      await t.query(
        `INSERT INTO prayer_requests (org_id, branch_id, member_id, user_id, text, category, visibility, ministry_id, group_id, status, assigned_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [O, branchMain, pick(memberIds), pick([users.member1, users.member2, users.pastor]),
          pick(['Please pray for my father’s surgery next week.', 'Grateful for the job interview — pray for a favourable outcome.', 'Praying through a hard season; would appreciate a phone call.', 'Our family is expecting a baby in December.', 'Pray for wisdom as I decide on a new ministry role.', 'Thanksgiving — my daughter passed her exams!', 'Struggling with insomnia and anxiety, would appreciate prayer.', 'Pray for our mission partners in the village.']),
          pick(['health', 'work', 'family', 'spiritual', 'gratitude', 'other'] as const), vis,
          vis === 'ministry' ? ministryIdsList[0] : null, vis === 'group' ? groupIds[2] : null,
          pick(['active', 'active', 'prayed', 'closed'] as const), chance(0.3) ? users.pastor : null],
      );
    }

    /* ── Visitors (24) ── */
    for (let i = 0; i < 24; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const status = pick(['none', 'none', 'planned', 'contacted', 'converted'] as const);
      const converted = status === 'converted' ? pick(memberIds) : null;
      const v = (await t.query(
        `INSERT INTO visitors (org_id, branch_id, service_id, visit_date, first_name, last_name, phone, email, city, heard_from, invited_by, interests, followup_status, assigned_to, converted_member_id, converted_at, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Juba',$9,$10,$11,$12,$13,$14,$15,true) RETURNING id`,
        [O, branchMain, sundayMain, daysAgo(int(1, 60)), first, last, `+211 9${int(10000000, 99999999)}`,
          `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + i + '@demo.example',
          pick(['friend', 'family', 'online', 'social_media', 'other'] as const),
          chance(0.5) ? `${pick(FIRST)} ${pick(LAST)}` : null,
          JSON.stringify(chance(0.5) ? [pick(['Choir', 'Youth', 'Prayer'])] : []),
          status, status !== 'none' ? pick([users.pastor, users.secretary, users.cell1]) : null,
          converted, converted ? daysAgo(int(0, 30)) : null],
      ))[0].id as string;
      if (status === 'contacted' || status === 'converted') {
        await t.query('INSERT INTO visitor_followups (visitor_id, by_user, outcome, note) VALUES ($1,$2,$3,$4)',
          [v, users.pastor, status === 'converted' ? 'converted' : 'contacted',
           status === 'converted' ? 'Visited again and joined as a member.' : 'Phoned — would like to attend the midweek service.']);
      }
    }

    /* ── Follow-ups (10) ── */
    const visitorIdsForFu: string[] = (await t.query<any[]>('SELECT id FROM visitors')).map((r) => r.id as string);
    const fu: [string, string, string, string, string, string][] = [
      ['visitor', 'New visitor follow-up: Joseph Kwo', 'New visitor follow-up: Joseph Kwo', 'pending', users.pastor, branchMain],
      ['new_member', 'Welcome new member — introduce to a group/mentor', 'Welcome new member', 'in_progress', users.secretary, branchMain],
      ['attendance', 'Absent from Sunday Service since 6 weeks ago', 'Absence follow-up', 'pending', users.pastor, branchMain],
      ['manual', 'Check in on the Ochieng family after hospital discharge', 'Post-hospital check-in', 'in_progress', users.pastor, branchMain],
      ['event', 'Follow up with picnic volunteers after event', 'Event follow-up', 'pending', users.secretary, branchMain],
      ['prayer', 'Return call for prayer request (health)', 'Prayer follow-up', 'completed', users.pastor, branchMain],
      ['visitor', 'New visitor follow-up: Mary Anyi', 'New visitor follow-up: Mary Anyi', 'pending', users.cell1, branchMain],
      ['attendance', 'Absent from Midweek Service since 2 months ago', 'Absence follow-up', 'pending', users.pastor, branchEast],
      ['new_member', 'Welcome new member — baptism inquiry', 'Baptism inquiry', 'pending', users.pastor, branchMain],
      ['manual', 'Confirm group leader for the new Eastside cell', 'Leadership', 'completed', users.super, branchEast],
    ];
    for (const [source, reason, , status, assignee, branch] of fu) {
      const subject = source === 'visitor' && visitorIdsForFu.length ? pick(visitorIdsForFu) : pick(memberIds);
      await t.query(
        `INSERT INTO followups (org_id, branch_id, source, subject_type, subject_id, member_id, reason, assigned_to, due_date, priority, status, outcome, completed_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [O, branch, source, source === 'visitor' ? 'visitor' : 'member', subject ?? pick(memberIds),
          source === 'member' ? subject ?? null : null, reason, assignee, daysAhead(int(-3, 10)),
          pick(['low', 'normal', 'normal', 'high', 'urgent'] as const), status,
          status === 'completed' ? 'Contacted; member is doing well.' : null,
          status === 'completed' ? new Date().toISOString() : null, users.secretary],
      );
    }

    /* ── Funds (6) ── */
    const fundDefs: [string, string, string][] = [
      ['general', 'General Fund', 'Regular tithe and offering'],
      ['missions', 'Missions', 'Local and overseas mission work'],
      ['building', 'Building Project', 'Church building and maintenance'],
      ['youth', 'Youth Ministry', 'Youth ministry operations'],
      ['children', 'Children’s Ministry', 'Children’s ministry operations'],
      ['benevolence', 'Benevolence', 'Assistance to members in need'],
    ];
    const fundIds: Record<string, string> = {};
    for (const [code, name, desc] of fundDefs) {
      fundIds[code] = (await t.query('INSERT INTO giving_funds (org_id, code, name, description, is_demo) VALUES ($1,$2,$3,$4,true) RETURNING id', [O, code, name, desc]))[0].id as string;
    }

    /* ── Giving: 6 months of transactions ── */
    let receiptSeq = 1;
    for (let m = 5; m >= 0; m--) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setMonth(monthStart.getMonth() - m);
      const count = int(25, 60);
      for (let i = 0; i < count; i++) {
        const day = int(1, 28);
        const d = new Date(monthStart);
        d.setDate(Math.min(day, 28));
        if (d > new Date()) continue;
        const fund = pick(Object.values(fundIds));
        const method = pick(['cash', 'cash', 'mobile_money', 'online', 'check', 'bank_transfer'] as const);
        const amount = pick([10, 20, 50, 50, 100, 100, 250, 500, 1000, 2500]);
        const anon = chance(0.15);
        const member = pick(memberIds);
        const rec = chance(0.5) ? `R-${d.getFullYear()}-${String(receiptSeq++).padStart(5, '0')}` : null;
        await t.query(
          `INSERT INTO giving_transactions (org_id, branch_id, fund_id, member_id, amount, tx_date, method, is_anonymous, status, receipt_no, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'recorded',$9,$10)`,
          [O, branchMain, fund, anon ? null : member, amount, d.toISOString().slice(0, 10), method, anon, rec, users.finance],
        );
        if (rec) {
          await t.query(
            "INSERT INTO financial_receipts (org_id, branch_id, receipt_no, kind, entity_id, amount, issued_by) VALUES ($1,$2,$3,'giving',(SELECT id FROM giving_transactions WHERE receipt_no = $3), $4, $5)",
            [O, branchMain, rec, amount, users.finance],
          );
        }
      }
    }

    /* ── Expense categories + expenses ── */
    const catNames = ['utilities', 'building', 'ministry_programs', 'supplies', 'food_hospitality', 'transport', 'media', 'personnel', 'missionary_support', 'other'];
    const catIds: Record<string, string> = {};
    for (const c of catNames) {
      catIds[c] = (await t.query('INSERT INTO expense_categories (org_id, name) VALUES ($1,$2) ON CONFLICT (org_id, name) DO NOTHING RETURNING id', [O, c]))[0].id as string;
    }
    const expenseDefs: [string, string, string, number, string, string][] = [
      ['Church hall electricity bill', 'utilities', 'paid', 4, 'Juba Power Company', 'bank_transfer'],
      ['Sound system repair', 'media', 'paid', 3, 'TechFix Audio', 'mobile_money'],
      ['Youth Day Camp transport', 'ministry_programs', 'approved', 5, 'Blue Sky Tours', 'bank_transfer'],
      ['Baptism materials (books, towels)', 'ministry_programs', 'submitted', 2, 'Faith Publications', 'cash'],
      ['Paint and brushes for fellowship hall', 'building', 'approved', 6, 'Juba Hardware', 'mobile_money'],
      ['Midweek service refreshments', 'food_hospitality', 'paid', 1, 'Mama Rose Bakery', 'cash'],
      ['Fuel for outreach van', 'transport', 'submitted', 1, 'Shell Juba East', 'cash'],
      ['Website hosting (annual)', 'media', 'draft', 0, 'CloudHost', 'bank_transfer'],
      ['Missionary support — sister Lydia', 'missionary_support', 'paid', 2, 'Direct', 'bank_transfer'],
      ['Cleaning supplies', 'supplies', 'paid', 1, 'CleanPro', 'mobile_money'],
      ['Security staff stipends', 'personnel', 'approved', 4, 'Internal', 'cash'],
      ['Community outreach medical kits', 'ministry_programs', 'rejected', 3, 'MedSupply', 'cash'],
    ];
    for (const [title, cat, status, monthsAgo, vendor, method] of expenseDefs) {
      const d = new Date();
      d.setMonth(d.getMonth() - monthsAgo);
      d.setDate(int(2, 26));
      const amount = int(40, 2200);
      const submitted = status !== 'draft' ? users.finance : null;
      const approved = ['approved', 'paid'].includes(status) ? users.super : status === 'rejected' ? users.super : null;
      await t.query(
        `INSERT INTO expenses (org_id, branch_id, fund_id, category_id, title, amount, expense_date, vendor, method, status, submitted_by, approved_by, approved_at, rejected_reason, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [O, branchMain, fundIds.general, catIds[cat], title, amount, d.toISOString().slice(0, 10), vendor, method, status,
          submitted, approved, approved ? d.toISOString() : null, status === 'rejected' ? 'Please obtain a second quotation.' : null,
          status === 'paid' ? d.toISOString() : null],
      );
    }

    /* ── Public registrations (3 pending) ── */
    const regNames: [string, string, string, string][] = [
      ['John', 'Deng', 'john.deng@demo.example', '+211 955 111 222'],
      ['Sarah', 'Nyandeng', 'sarah.ny@demo.example', '+211 955 333 444'],
      ['Peter', 'Achieng', 'peter.ach@demo.example', '+211 955 555 666'],
    ];
    for (const [f, l, email, phone] of regNames) {
      await t.query(
        `INSERT INTO member_registrations (org_id, first_name, last_name, email, phone, city, country, interests, heard_from, message, status, source)
         VALUES ($1,$2,$3,$4,$5,'Juba','South Sudan',$6,$7,$8,'pending','online')`,
        [O, f, l, email, phone, JSON.stringify([pick(['Choir', 'Youth', 'Hospitality'])]), 'friend', 'I visited last Sunday and would love to join.'],
      );
    }

    /* ── Notifications (a handful for admins) ── */
    for (const u of [users.super, users.pastor, users.secretary, users.finance]) {
      await t.query("INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'system','Welcome to Nazareth Parish ChMS','This is a demo notification center. New announcements, tasks and reminders will appear here.', '/dashboard')", [u]);
      await t.query("INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1,'task_assigned','2 expenses await approval','Please review the pending expenses in the finance module.', '/finance/expenses')", [u]);
    }

    /* ── Audit log samples ── */
    const auditRows: [string, string, string, string, Record<string, unknown>][] = [
      [users.super, 'auth.login', 'user', users.super, {}],
      [users.secretary, 'auth.login', 'user', users.secretary, {}],
      [users.secretary, 'member.create', 'member', memberIds[0], { member_no: 'NPH-0001' }],
      [users.pastor, 'pastoral.case.view', 'pastoral_case', null, { note: 'demo' }],
      [users.finance, 'giving.create', 'giving_transaction', null, { note: 'demo batch' }],
      [users.super, 'settings.update', 'organization', O, { fields: ['currency'] }],
      [users.secretary, 'announcement.create', 'announcement', null, { note: 'demo' }],
    ];
    for (const [u, action, entity, entityId, md] of auditRows) {
      await t.query('INSERT INTO audit_logs (org_id, user_id, ip, action, entity, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [O, u, '127.0.0.1', action, entity, entityId, JSON.stringify(md)]);
    }
  });

  console.log('Seed complete.');
  console.log('Demo logins (password: Password123):');
  console.log('  superadmin@nazarethparish.org   — Super Administrator');
  console.log('  pastor@nazarethparish.org       — Pastor');
  console.log('  secretary@nazarethparish.org    — Church Administrator');
  console.log('  finance@nazarethparish.org      — Finance Officer');
  console.log('  youth.leader@nazarethparish.org — Ministry Leader (Youth)');
  console.log('  cell.leader1@nazarethparish.org — Group Leader');
  console.log('  member@nazarethparish.org       — Member (portal)');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
