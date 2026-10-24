// Database schema of the member area. Applied by `ensureSchema()` in db.ts on the first request
// of each Worker instance; every migration runs once per database and is recorded in `schema_migrations`.
// Add a new entry at the end for every change; never edit an entry that is already live.

/** Better Auth tables (user, session, account, verification, rateLimit) plus the club's own tables. */
export const migrations: ReadonlyArray<{ name: string; statements: string[] }> =
  [
    {
      name: '0001_members',
      statements: [
        `CREATE TABLE IF NOT EXISTS "user" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "email" TEXT NOT NULL UNIQUE,
          "emailVerified" INTEGER NOT NULL DEFAULT 0,
          "image" TEXT,
          "createdAt" TEXT NOT NULL,
          "updatedAt" TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS "session" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "expiresAt" TEXT NOT NULL,
          "token" TEXT NOT NULL UNIQUE,
          "createdAt" TEXT NOT NULL,
          "updatedAt" TEXT NOT NULL,
          "ipAddress" TEXT,
          "userAgent" TEXT,
          "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "session_userId" ON "session" ("userId")`,
        `CREATE TABLE IF NOT EXISTS "account" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "accountId" TEXT NOT NULL,
          "providerId" TEXT NOT NULL,
          "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
          "accessToken" TEXT,
          "refreshToken" TEXT,
          "idToken" TEXT,
          "accessTokenExpiresAt" TEXT,
          "refreshTokenExpiresAt" TEXT,
          "scope" TEXT,
          "password" TEXT,
          "createdAt" TEXT NOT NULL,
          "updatedAt" TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "account_userId" ON "account" ("userId")`,
        `CREATE TABLE IF NOT EXISTS "verification" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "identifier" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "expiresAt" TEXT NOT NULL,
          "createdAt" TEXT NOT NULL,
          "updatedAt" TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "verification_identifier" ON "verification" ("identifier")`,
        `CREATE TABLE IF NOT EXISTS "rateLimit" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "key" TEXT UNIQUE,
          "count" INTEGER,
          "lastRequest" INTEGER
        )`,
        // Club profile, one row per user. Health data (neurodivergence) only with its own consent.
        `CREATE TABLE IF NOT EXISTS "member" (
          "user_id" TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
          "university" TEXT NOT NULL,
          "language" TEXT NOT NULL DEFAULT 'en',
          "linkedin" TEXT,
          "date_of_birth" TEXT,
          "gender" TEXT,
          "neurodivergence" TEXT,
          "neurodivergence_consent_at" TEXT,
          "privacy_consent_at" TEXT NOT NULL,
          "directory_opt_in" INTEGER NOT NULL DEFAULT 0,
          "mail_events" INTEGER NOT NULL DEFAULT 1,
          "mail_newsletter" INTEGER NOT NULL DEFAULT 0,
          "picture_key" TEXT,
          "role" TEXT NOT NULL DEFAULT 'member',
          "notion_page_id" TEXT,
          "created_at" TEXT NOT NULL,
          "updated_at" TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS "event_registration" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
          "event_id" TEXT NOT NULL,
          "event_title" TEXT NOT NULL,
          "event_start" TEXT,
          "event_end" TEXT,
          "event_location" TEXT,
          "notion_page_id" TEXT,
          "created_at" TEXT NOT NULL,
          UNIQUE ("user_id", "event_id")
        )`,
        `CREATE INDEX IF NOT EXISTS "event_registration_event" ON "event_registration" ("event_id")`,
        // Work queue for the copy in Notion. Rows are deleted once Notion confirmed the change.
        `CREATE TABLE IF NOT EXISTS "notion_sync" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
          "kind" TEXT NOT NULL,
          "ref" TEXT NOT NULL,
          "payload" TEXT,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "last_error" TEXT,
          "created_at" TEXT NOT NULL
        )`,
      ],
    },
    {
      // Member-only material (files in R2, uploaded by the board). `uploaded_by` keeps the
      // uploader's name as text, so the row survives when that account is deleted.
      name: '0002_material',
      statements: [
        `CREATE TABLE IF NOT EXISTS "material" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "r2_key" TEXT NOT NULL,
          "file_name" TEXT NOT NULL,
          "content_type" TEXT NOT NULL,
          "size" INTEGER NOT NULL,
          "uploaded_by" TEXT NOT NULL,
          "created_at" TEXT NOT NULL
        )`,
      ],
    },
    {
      // Club inbox: one row per conversation at contact@, mirrored in the Notion database
      // "Club Inbox". `id` is the Message-ID of the first mail. `inbox_state` holds small
      // cursors (last daily summary, last reply check).
      name: '0003_inbox',
      statements: [
        `CREATE TABLE IF NOT EXISTS "inbox_message" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "notion_page_id" TEXT,
          "from_email" TEXT NOT NULL,
          "from_name" TEXT,
          "subject" TEXT NOT NULL,
          "preview" TEXT,
          "received_at" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'new',
          "replies" INTEGER NOT NULL DEFAULT 0,
          "reminded_at" TEXT,
          "answered_at" TEXT,
          "updated_at" TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS "inbox_message_status" ON "inbox_message" ("status", "received_at")`,
        `CREATE TABLE IF NOT EXISTS "inbox_thread" (
          "message_id" TEXT NOT NULL PRIMARY KEY,
          "conversation_id" TEXT NOT NULL REFERENCES "inbox_message" ("id") ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS "inbox_state" (
          "key" TEXT NOT NULL PRIMARY KEY,
          "value" TEXT NOT NULL
        )`,
      ],
    },
    {
      // Retention: when a member was last active (sign-in or page view, updated at most daily)
      // and when the inactivity warning went out. `job_state` holds cursors of scheduled jobs.
      name: '0004_retention',
      statements: [
        `ALTER TABLE "member" ADD COLUMN "last_seen_at" TEXT`,
        `ALTER TABLE "member" ADD COLUMN "inactivity_warned_at" TEXT`,
        `UPDATE "member" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL`,
        `CREATE TABLE IF NOT EXISTS "job_state" (
          "key" TEXT NOT NULL PRIMARY KEY,
          "value" TEXT NOT NULL
        )`,
      ],
    },
    {
      // Second factor (Better Auth two-factor plugin) and the step-up state of each session.
      name: '0005_two_factor',
      statements: [
        `ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" INTEGER DEFAULT 0`,
        `CREATE TABLE IF NOT EXISTS "twoFactor" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "secret" TEXT NOT NULL,
          "backupCodes" TEXT NOT NULL,
          "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
          "verified" INTEGER DEFAULT 1,
          "failedVerificationCount" INTEGER DEFAULT 0,
          "lockedUntil" TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS "twoFactor_userId" ON "twoFactor" ("userId")`,
        `CREATE INDEX IF NOT EXISTS "twoFactor_secret" ON "twoFactor" ("secret")`,
        `CREATE TABLE IF NOT EXISTS "session_mfa" (
          "session_id" TEXT NOT NULL PRIMARY KEY REFERENCES "session" ("id") ON DELETE CASCADE,
          "user_id" TEXT NOT NULL,
          "verified_at" TEXT,
          "failed" INTEGER NOT NULL DEFAULT 0
        )`,
      ],
    },
    {
      // The second factor (0005) was removed on 2026-10-10: Max decided against an authenticator
      // code. Sign-in is by email link only; board members protect their mail accounts with the
      // mail provider's two-step verification instead.
      name: '0006_remove_two_factor',
      statements: [
        `DROP TABLE IF EXISTS "session_mfa"`,
        `DROP INDEX IF EXISTS "twoFactor_userId"`,
        `DROP INDEX IF EXISTS "twoFactor_secret"`,
        `DROP TABLE IF EXISTS "twoFactor"`,
        `ALTER TABLE "user" DROP COLUMN "twoFactorEnabled"`,
      ],
    },
    {
      // Max decided on 2026-10-10 that the club collects no health data. The neurodivergence
      // answer and its consent time are deleted, then the columns are dropped.
      name: '0007_remove_neurodivergence',
      statements: [
        `UPDATE "member" SET "neurodivergence" = NULL, "neurodivergence_consent_at" = NULL`,
        `ALTER TABLE "member" DROP COLUMN "neurodivergence"`,
        `ALTER TABLE "member" DROP COLUMN "neurodivergence_consent_at"`,
      ],
    },
    {
      // Events from Notion (src/lib/events/sync.ts): one row per published event, the event as
      // JSON in the shape of content.json, and the Notion file path of its image.
      name: '0008_events',
      statements: [
        `CREATE TABLE IF NOT EXISTS "event" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "data" TEXT NOT NULL,
          "image_source" TEXT,
          "synced_at" TEXT NOT NULL
        )`,
      ],
    },
  ];
