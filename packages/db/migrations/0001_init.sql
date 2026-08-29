-- ═══════════════════════════════════════════════════════════════════════════
-- Nazareth Parish ChMS — initial schema (0001_init)
-- PostgreSQL 14+ (developed against 15/18)
--
-- Conventions
--  * uuid primary keys (gen_random_uuid())
--  * timestamptz everywhere; updated_at maintained by trigger
--  * org_id on tenantable tables (future multi-church)
--  * branch_id on branch-scoped records (multi-branch)
--  * soft delete via deleted_at on historical records
--  * money as NUMERIC(12,2)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────── Tenant ───────────────────────────

CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  address       text,
  phone         text,
  email         text,
  website       text,
  country       text,
  timezone      text NOT NULL DEFAULT 'UTC',
  currency      char(3) NOT NULL DEFAULT 'USD',
  date_format   text NOT NULL DEFAULT 'DD/MM/YYYY',
  default_language text NOT NULL DEFAULT 'en',
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo_file_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE TRIGGER trg_org_upd BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  name          text NOT NULL,
  is_primary    boolean NOT NULL DEFAULT false,
  address       text,
  phone         text,
  email         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (org_id, code),
  CONSTRAINT branches_name_active_chk CHECK (is_active OR deleted_at IS NOT NULL)
);
CREATE INDEX idx_branches_org ON branches(org_id);
CREATE TRIGGER trg_branch_upd BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────── Identity & Access ───────────────────────────

CREATE TABLE permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  label         text NOT NULL,
  module        text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_permissions_module ON permissions(module);

CREATE TABLE roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  name          text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (org_id, code)
);
CREATE TRIGGER trg_role_upd BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id           uuid REFERENCES branches(id) ON DELETE SET NULL,
  name                text NOT NULL,
  email               text NOT NULL,
  phone               text,
  avatar_file_id      uuid,
  password_hash       text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  email_verified_at   timestamptz,
  totp_secret         text,
  is_active           boolean NOT NULL DEFAULT true,
  failed_logins       integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until        timestamptz,
  last_login_at       timestamptz,
  last_login_ip       text,
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  UNIQUE (org_id, email)
);
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE TRIGGER trg_user_upd BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_roles (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,  -- NULL = applies to all branches
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id, branch_id)
);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- users.member_id links a login to a member record (circular FK added after members)
-- (column added at the end of this migration)

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  ip            text,
  user_agent    text,
  remember      boolean NOT NULL DEFAULT false,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at);

CREATE TABLE password_reset_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prs_not_used_chk CHECK (used_at IS NULL)
);

CREATE TABLE email_verification_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_attempts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip            text,
  email         text,
  success       boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, created_at);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

-- ─────────────────────────── Members ───────────────────────────

CREATE TABLE member_status_defs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  color         text NOT NULL DEFAULT '#1e3a8a',
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, code)
);

CREATE TABLE members (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id               uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  user_id                 uuid REFERENCES users(id) ON DELETE SET NULL,
  member_no               text NOT NULL,
  first_name              text NOT NULL,
  middle_name             text,
  last_name               text NOT NULL,
  preferred_name          text,
  gender                  text CHECK (gender IN ('male','female','other')),
  date_of_birth           date,
  phone                   text,
  email                   text,
  address                 text,
  city                    text,
  country                 text,
  avatar_file_id          uuid,
  emergency_contact_name  text,
  emergency_contact_phone text,
  status                  text NOT NULL DEFAULT 'active',
  member_type             text NOT NULL DEFAULT 'regular' CHECK (member_type IN ('regular','associate','honorary')),
  date_joined             date,
  first_attendance        date,
  baptism_status          text NOT NULL DEFAULT 'none' CHECK (baptism_status IN ('none','baptized','pending','not_applicable')),
  baptism_date            date,
  confirmation_status     text NOT NULL DEFAULT 'none' CHECK (confirmation_status IN ('none','confirmed','pending','not_applicable')),
  confirmation_date       date,
  previous_church         text,
  skills                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  interests               jsonb NOT NULL DEFAULT '[]'::jsonb,
  volunteer               boolean NOT NULL DEFAULT false,
  notes                   text,
  is_demo                 boolean NOT NULL DEFAULT false,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  UNIQUE (org_id, member_no)
);
CREATE INDEX idx_members_org ON members(org_id);
CREATE INDEX idx_members_branch ON members(branch_id);
CREATE INDEX idx_members_status ON members(branch_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_members_name ON members(last_name, first_name);
CREATE INDEX idx_members_phone ON members(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_members_email ON members(email) WHERE email IS NOT NULL;
CREATE INDEX idx_members_dob ON members(date_of_birth);
CREATE INDEX idx_members_joined ON members(date_joined);
CREATE INDEX idx_members_user ON members(user_id);
CREATE TRIGGER trg_member_upd BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- circular FK: users.member_id → members(id)
ALTER TABLE users ADD COLUMN member_id uuid REFERENCES members(id) ON DELETE SET NULL;
CREATE INDEX idx_users_member ON users(member_id);

CREATE TABLE member_status_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  from_status   text,
  to_status     text NOT NULL,
  reason        text,
  changed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_status_changes_member ON member_status_changes(member_id, created_at DESC);

CREATE TABLE member_relationships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  related_id    uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('spouse','parent','child','sibling','household')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (member_id <> related_id)
);
CREATE INDEX idx_member_relationships_member ON member_relationships(member_id);
CREATE INDEX idx_member_relationships_related ON member_relationships(related_id);

CREATE TABLE families (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  address       text,
  city          text,
  country       text,
  phone         text,
  email         text,
  primary_contact_id uuid REFERENCES members(id) ON DELETE SET NULL,
  note          text,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_families_branch ON families(branch_id);
CREATE TRIGGER trg_family_upd BEFORE UPDATE ON families FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE family_members (
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('head','spouse','child','other','member')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, member_id)
);
CREATE INDEX idx_family_members_member ON family_members(member_id);

CREATE TABLE member_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  first_name    text NOT NULL,
  middle_name   text,
  last_name     text NOT NULL,
  gender        text CHECK (gender IN ('male','female','other')),
  date_of_birth date,
  email         text,
  phone         text,
  address       text,
  city          text,
  country       text,
  family_name   text,
  family_info   jsonb NOT NULL DEFAULT '{}'::jsonb,
  interests     jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_church text,
  heard_from    text,
  message       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  review_note   text,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  source        text NOT NULL DEFAULT 'online' CHECK (source IN ('online','admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_registrations_status ON member_registrations(org_id, status, created_at DESC);
CREATE TRIGGER trg_registrations_upd BEFORE UPDATE ON member_registrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────── Visitors ───────────────────────────

CREATE TABLE visitors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  service_id    uuid,
  visit_date    date NOT NULL,
  first_name    text NOT NULL,
  middle_name   text,
  last_name     text,
  phone         text,
  email         text,
  address       text,
  city          text,
  heard_from    text,
  invited_by    text,
  interests     jsonb NOT NULL DEFAULT '[]'::jsonb,
  followup_status text NOT NULL DEFAULT 'none' CHECK (followup_status IN ('none','planned','contacted','converted','closed')),
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  note          text,
  converted_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  converted_at  timestamptz,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_visitors_branch ON visitors(branch_id, visit_date DESC);
CREATE INDEX idx_visitors_email ON visitors(email) WHERE email IS NOT NULL;
CREATE INDEX idx_visitors_phone ON visitors(phone) WHERE phone IS NOT NULL;
CREATE TRIGGER trg_visitor_upd BEFORE UPDATE ON visitors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE visitor_followups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id    uuid NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  by_user       uuid REFERENCES users(id) ON DELETE SET NULL,
  outcome       text,
  note          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_visitor_followups_visitor ON visitor_followups(visitor_id, created_at DESC);

-- ─────────────────────────── Ministries / Departments / Groups ───────────────────────────

CREATE TABLE ministries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  description   text,
  leader_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  assistant_leader_id uuid REFERENCES members(id) ON DELETE SET NULL,
  meeting_day   text,
  meeting_time  text,
  location      text,
  is_active     boolean NOT NULL DEFAULT true,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_ministries_branch ON ministries(branch_id);
CREATE TRIGGER trg_ministry_upd BEFORE UPDATE ON ministries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ministry_members (
  ministry_id   uuid NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','assistant','member')),
  is_active     boolean NOT NULL DEFAULT true,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ministry_id, member_id)
);
CREATE INDEX idx_ministry_members_member ON ministry_members(member_id);

CREATE TABLE departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  ministry_id   uuid REFERENCES ministries(id) ON DELETE SET NULL,
  name          text NOT NULL,
  description   text,
  leader_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  responsibilities text,
  is_active     boolean NOT NULL DEFAULT true,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_departments_branch ON departments(branch_id);
CREATE TRIGGER trg_department_upd BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE department_members (
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','assistant','member')),
  is_active     boolean NOT NULL DEFAULT true,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, member_id)
);
CREATE INDEX idx_department_members_member ON department_members(member_id);

CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  type          text NOT NULL DEFAULT 'cell',
  description   text,
  leader_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  assistant_leader_id uuid REFERENCES members(id) ON DELETE SET NULL,
  location      text,
  meeting_day   text,
  meeting_time  text,
  is_active     boolean NOT NULL DEFAULT true,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_groups_branch ON groups(branch_id);
CREATE TRIGGER trg_group_upd BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE group_members (
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','assistant','member')),
  is_active     boolean NOT NULL DEFAULT true,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX idx_group_members_member ON group_members(member_id);

-- ─────────────────────────── Attendance ───────────────────────────

CREATE TABLE services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  category      text NOT NULL CHECK (category IN ('sunday','midweek','bible_study','prayer_meeting','youth','children','ministry','special')),
  day_of_week   smallint CHECK (day_of_week BETWEEN 0 AND 6),
  time          text,
  location      text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_services_branch ON services(branch_id);
CREATE TRIGGER trg_service_upd BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attendance_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  session_date  date NOT NULL,
  note          text,
  recorded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, session_date)
);
CREATE INDEX idx_att_sessions_branch_date ON attendance_sessions(branch_id, session_date DESC);
CREATE TRIGGER trg_att_session_upd BEFORE UPDATE ON attendance_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attendance_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  visitor_id    uuid REFERENCES visitors(id) ON DELETE SET NULL,
  status        text NOT NULL CHECK (status IN ('present','absent','excused','visitor','first_time')),
  note          text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (member_id IS NOT NULL OR visitor_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_att_records_member ON attendance_records(session_id, member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX uq_att_records_visitor ON attendance_records(session_id, visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX idx_att_records_member ON attendance_records(member_id);
CREATE INDEX idx_att_records_session ON attendance_records(session_id);

-- ─────────────────────────── Events ───────────────────────────

CREATE TABLE events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  description   text,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz,
  location      text,
  capacity      integer CHECK (capacity IS NULL OR capacity > 0),
  registration_required boolean NOT NULL DEFAULT false,
  registration_deadline timestamptz,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','completed','cancelled')),
  visibility    text NOT NULL DEFAULT 'members' CHECK (visibility IN ('public','members','ministry','group')),
  ministry_id   uuid REFERENCES ministries(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  group_id      uuid REFERENCES groups(id) ON DELETE SET NULL,
  organizer_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  note          text,
  last_reminded_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_events_branch_date ON events(branch_id, starts_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_status ON events(org_id, status, starts_at);
CREATE TRIGGER trg_event_upd BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE event_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','attended','absent','cancelled')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX idx_event_regs_event ON event_registrations(event_id);

-- ─────────────────────────── Communication ───────────────────────────

CREATE TABLE announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  content       text NOT NULL,
  audience      jsonb NOT NULL DEFAULT '{"type":"all"}'::jsonb,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','expired')),
  publish_at    timestamptz,
  expires_at    timestamptz,
  image_file_id uuid,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_announcements_status ON announcements(org_id, status, publish_at);
CREATE TRIGGER trg_announcement_upd BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          text NOT NULL,
  title         text NOT NULL,
  body          text,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_announcements boolean NOT NULL DEFAULT true,
  email_events        boolean NOT NULL DEFAULT true,
  email_groups        boolean NOT NULL DEFAULT true,
  sms_events          boolean NOT NULL DEFAULT false,
  sms_followup        boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code          text NOT NULL,
  name          text NOT NULL,
  channel       text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','in_app')),
  subject       text NOT NULL DEFAULT '',
  body          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
CREATE TRIGGER trg_template_upd BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────── Pastoral / Prayer / Follow-ups ───────────────────────────

CREATE TABLE pastoral_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  type          text NOT NULL CHECK (type IN ('counseling','home_visit','hospital_visit','bereavement','marriage_support','crisis_support','followup')),
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  resolution    text,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_pastoral_cases_member ON pastoral_cases(member_id);
CREATE INDEX idx_pastoral_cases_status ON pastoral_cases(org_id, status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_pastoral_upd BEFORE UPDATE ON pastoral_cases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE pastoral_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES pastoral_cases(id) ON DELETE CASCADE,
  by_user       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body          text NOT NULL,
  sensitive     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pastoral_notes_case ON pastoral_notes(case_id, created_at);

CREATE TABLE prayer_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text          text NOT NULL,
  category      text NOT NULL DEFAULT 'other',
  visibility    text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','pastoral','ministry','group','church')),
  ministry_id   uuid REFERENCES ministries(id) ON DELETE SET NULL,
  group_id      uuid REFERENCES groups(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','prayed','closed')),
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_prayer_org ON prayer_requests(org_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_prayer_user ON prayer_requests(user_id);
CREATE TRIGGER trg_prayer_upd BEFORE UPDATE ON prayer_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE followups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  source        text NOT NULL CHECK (source IN ('visitor','new_member','attendance','prayer','pastoral','event','registration','manual')),
  subject_type  text NOT NULL CHECK (subject_type IN ('visitor','member','event','prayer','pastoral','manual')),
  subject_id    uuid NOT NULL,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  visitor_id    uuid REFERENCES visitors(id) ON DELETE SET NULL,
  reason        text NOT NULL,
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date      date,
  priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  outcome       text,
  completed_at  timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_followups_assigned ON followups(assigned_to, status) WHERE status IN ('pending','in_progress');
CREATE INDEX idx_followups_member ON followups(member_id);
CREATE INDEX idx_followups_subject ON followups(subject_type, subject_id);
CREATE TRIGGER trg_followup_upd BEFORE UPDATE ON followups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE followup_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id   uuid NOT NULL REFERENCES followups(id) ON DELETE CASCADE,
  by_user       uuid REFERENCES users(id) ON DELETE SET NULL,
  note          text NOT NULL,
  outcome       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_followup_notes_fu ON followup_notes(followup_id, created_at DESC);

-- ─────────────────────────── Finance ───────────────────────────

CREATE TABLE giving_funds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  code          text NOT NULL,
  name          text NOT NULL,
  description   text,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  is_active     boolean NOT NULL DEFAULT true,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (org_id, code)
);
CREATE TRIGGER trg_fund_upd BEFORE UPDATE ON giving_funds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE giving_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  fund_id       uuid NOT NULL REFERENCES giving_funds(id) ON DELETE RESTRICT,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  amount        numeric(12,2) NOT NULL CHECK (amount <> 0),
  tx_date       date NOT NULL,
  method        text NOT NULL CHECK (method IN ('cash','check','online','mobile_money','bank_transfer','other')),
  reference     text,
  is_anonymous  boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','confirmed','reconciled','reversed')),
  reversed_by   uuid REFERENCES giving_transactions(id) ON DELETE SET NULL,
  reversal_reason text,
  note          text,
  receipt_no    text UNIQUE,
  recorded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_giving_fund_date ON giving_transactions(fund_id, tx_date);
CREATE INDEX idx_giving_member_date ON giving_transactions(member_id, tx_date) WHERE member_id IS NOT NULL;
CREATE INDEX idx_giving_org_date ON giving_transactions(org_id, tx_date);
CREATE INDEX idx_giving_method ON giving_transactions(method, tx_date);
CREATE TRIGGER trg_giving_upd BEFORE UPDATE ON giving_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE financial_receipts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  receipt_no    text NOT NULL UNIQUE,
  kind          text NOT NULL CHECK (kind IN ('giving','expense')),
  entity_id     uuid NOT NULL,
  amount        numeric(12,2) NOT NULL,
  issued_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  note          text
);
CREATE INDEX idx_receipts_entity ON financial_receipts(kind, entity_id);

CREATE TABLE expense_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, name)
);

CREATE TABLE expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  fund_id       uuid NOT NULL REFERENCES giving_funds(id) ON DELETE RESTRICT,
  category_id   uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  description   text,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  expense_date  date NOT NULL,
  vendor        text,
  method        text NOT NULL CHECK (method IN ('cash','check','online','mobile_money','bank_transfer','other')),
  reference     text,
  receipt_file_id uuid,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','paid')),
  submitted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  rejected_reason text,
  paid_at       timestamptz,
  paid_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT expenses_self_approve_chk CHECK (submitted_by IS NULL OR approved_by IS NULL OR submitted_by <> approved_by)
);
CREATE INDEX idx_expenses_fund_date ON expenses(fund_id, expense_date);
CREATE INDEX idx_expenses_status ON expenses(org_id, status);
CREATE INDEX idx_expenses_category ON expenses(category_id, expense_date);
CREATE TRIGGER trg_expense_upd BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────── Files / Audit / Misc ───────────────────────────

CREATE TABLE files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('avatar','member_document','event_document','expense_receipt','pastoral','church_document','other')),
  original_name text NOT NULL,
  stored_name   text NOT NULL,
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  uploader_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type   text,
  entity_id     uuid,
  is_private    boolean NOT NULL DEFAULT true,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_files_entity ON files(entity_type, entity_id);
CREATE INDEX idx_files_org ON files(org_id, kind);
CREATE TRIGGER trg_file_upd BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  ip            text,
  user_agent    text,
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     text,
  branch_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE saved_report_filters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_code   text NOT NULL,
  name          text NOT NULL,
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_filters_user ON saved_report_filters(user_id, report_code);

CREATE TABLE backup_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'database',
  status        text NOT NULL CHECK (status IN ('running','success','failed')),
  file_path     text,
  size_bytes    bigint,
  note          text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE TABLE dev_outbox (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel       text NOT NULL CHECK (channel IN ('email','sms')),
  to_address    text NOT NULL,
  subject       text,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dev_outbox_created ON dev_outbox(created_at DESC);

CREATE TABLE integration_configs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  channel       text NOT NULL CHECK (channel IN ('email','sms','payments','mobile_money','bank','accounting','calendar','whatsapp')),
  provider      text NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, channel, provider)
);
CREATE TRIGGER trg_integration_upd BEFORE UPDATE ON integration_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
