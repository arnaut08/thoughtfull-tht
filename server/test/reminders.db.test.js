import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// Runs against a real Postgres, since idempotency and restart behavior live in the SQL functions. Set
// REMINDERS_TEST_DATABASE_URL to a disposable database. The suite drops and recreates its public schema.
const DATABASE_URL = process.env.REMINDERS_TEST_DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;
const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const CRASH_APPLICATION = "reminders-crash-sim";
const openClients = new Set();

async function connect(applicationName) {
  const client = new pg.Client({ connectionString: DATABASE_URL, application_name: applicationName });
  openClients.add(client);
  await client.connect();
  return client;
}

// Ends every client a failed test left open, so a stuck transaction can't block the next reset.
async function closeOpenClients() {
  await Promise.allSettled([...openClients].map((client) => client.end()));
  openClients.clear();
}

async function resetDatabase() {
  const client = await connect();
  try {
    const { rows } = await client.query("select current_database() as name");
    if (!/test/i.test(rows[0].name)) {
      throw new Error(`Refusing to reset database "${rows[0].name}": its name must contain "test"`);
    }
    await client.query(`
      set lock_timeout = '5s';
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
      end $$;
      drop schema if exists public cascade;
      create schema public;
      create extension pgcrypto with schema public;
    `);
    for (const file of (await readdir(MIGRATIONS_DIR)).sort()) {
      await client.query(await readFile(new URL(file, MIGRATIONS_DIR), "utf8"));
    }
  } finally {
    await client.end();
  }
}

async function seedUsers(client) {
  const insert = (role, name) =>
    client
      .query(
        "insert into public.users (email, password_hash, name, role, timezone) values ($1, 'x', $2, $3, 'UTC') returning id",
        [`${name.toLowerCase()}@test.example`, name, role],
      )
      .then(({ rows }) => rows[0].id);
  return { professionalId: await insert("professional", "Pro"), memberId: await insert("member", "Mem") };
}

// Books a 50-minute session starting `hoursOut` hours from now.
async function bookAt(client, { professionalId, memberId }, hoursOut) {
  const startsAt = new Date(Date.now() + hoursOut * 3600_000).toISOString();
  const endsAt = new Date(Date.now() + hoursOut * 3600_000 + 50 * 60_000).toISOString();
  const { rows } = await client.query("select * from public.book_session($1, $2, $3, $4)", [
    professionalId,
    memberId,
    startsAt,
    endsAt,
  ]);
  return rows[0];
}

const makeAllRemindersDue = (client) =>
  client.query("update public.session_reminders set remind_at = now() - interval '1 second' where delivered_at is null");

const deliverDue = async (client) => {
  const { rows } = await client.query("select public.deliver_due_reminders() as delivered");
  return rows[0].delivered;
};

const countRows = async (client, sql, params = []) => Number((await client.query(sql, params)).rows[0].count);

describeWithDatabase("session reminder delivery against Postgres", () => {
  beforeEach(resetDatabase, 60_000);
  afterEach(closeOpenClients);

  test("each reminder is delivered once across repeated and concurrent runs", async () => {
    const setup = await connect();
    const users = await seedUsers(setup);
    for (let i = 0; i < 10; i++) {
      await bookAt(setup, users, 72 + i * 2);
    }
    await makeAllRemindersDue(setup);
    await setup.end();

    const workers = await Promise.all([connect(), connect(), connect()]);
    const results = await Promise.all(workers.map(deliverDue));
    await Promise.all(workers.map((worker) => worker.end()));

    const check = await connect();
    expect(results.reduce((sum, delivered) => sum + delivered, 0)).toBe(40);
    expect(await deliverDue(check)).toBe(0);
    expect(await countRows(check, "select count(*) from public.notifications where type = 'session_reminder'")).toBe(40);
    expect(await countRows(check, "select count(*) from public.session_reminders where delivered_at is null")).toBe(0);
    await check.end();
  });

  test("a run that crashes before commit delivers nothing, and the next run delivers everything", async () => {
    const setup = await connect();
    const users = await seedUsers(setup);
    await bookAt(setup, users, 72);
    await makeAllRemindersDue(setup);
    await setup.end();

    // Start a delivery run inside a transaction, then drop the connection without committing. The server rolls
    // the transaction back, the same as when the process dies mid-run.
    const crashing = await connect(CRASH_APPLICATION);
    await crashing.query("begin");
    expect(await deliverDue(crashing)).toBe(4);
    await crashing.end();
    await waitForCrashedBackendToExit();

    const recovery = await connect();
    expect(await countRows(recovery, "select count(*) from public.notifications")).toBe(0);
    expect(await countRows(recovery, "select count(*) from public.session_reminders where delivered_at is null")).toBe(4);
    expect(await deliverDue(recovery)).toBe(4);
    expect(await countRows(recovery, "select count(*) from public.notifications")).toBe(4);
    await recovery.end();
  });

  test("pending reminders survive a server restart and are delivered afterwards", async () => {
    const before = await connect();
    const users = await seedUsers(before);
    await bookAt(before, users, 72);
    await bookAt(before, users, 10);
    // The "server" goes down with reminders still pending.
    await before.end();

    const afterRestart = await connect();
    expect(await countRows(afterRestart, "select count(*) from public.session_reminders where delivered_at is null")).toBe(6);
    await makeAllRemindersDue(afterRestart);
    expect(await deliverDue(afterRestart)).toBe(6);
    await afterRestart.end();
  });

  test("re-saving an unchanged booking does not deliver or create reminders again", async () => {
    const client = await connect();
    const users = await seedUsers(client);
    const booking = await bookAt(client, users, 72);
    await makeAllRemindersDue(client);
    expect(await deliverDue(client)).toBe(4);

    // Rescheduling to the same start re-runs the reminder sync for a time that already has delivered reminders.
    await client.query(
      "select public.reschedule_session($1, $2, $3, $4, $5, true)",
      [booking.id, users.professionalId, users.memberId, booking.starts_at, booking.ends_at],
    );

    expect(await countRows(client, "select count(*) from public.session_reminders")).toBe(4);
    expect(await countRows(client, "select count(*) from public.session_reminders where delivered_at is null")).toBe(0);
    expect(await deliverDue(client)).toBe(0);
    await client.end();
  });
});

// Waits until the crashed connection has been fully torn down, so its transaction is rolled back before we read.
async function waitForCrashedBackendToExit() {
  const observer = await connect();
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const remaining = await countRows(
        observer,
        "select count(*) from pg_stat_activity where application_name = $1",
        [CRASH_APPLICATION],
      );
      if (remaining === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("crashed connection did not exit");
  } finally {
    await observer.end();
  }
}
