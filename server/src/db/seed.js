import { pool } from './pool.js';

const users = [
  { name: 'Maria Alvarez', email: 'maria@example.edu', role: 'manager', manager: null },
  { name: 'Sam Okafor', email: 'sam@example.edu', role: 'employee', manager: 'maria@example.edu' },
  {
    name: 'Priya Raman',
    email: 'priya@example.edu',
    role: 'employee',
    manager: 'maria@example.edu',
  },
];

const leaveTypes = [
  { name: 'Vacation', annualAllowance: 15 },
  { name: 'Sick', annualAllowance: 10 },
  { name: 'Personal', annualAllowance: 3 },
];

// Business-day counts are written out rather than computed so the seed stays independent
// of the holiday service and of network access. Every range below is checked against the
// 2026 US federal holidays.
const leaveRequests = [
  {
    email: 'sam@example.edu',
    type: 'Vacation',
    startDate: '2026-03-16',
    endDate: '2026-03-20',
    businessDays: 5,
    note: 'Spring break with the family',
    status: 'approved',
    decidedBy: 'maria@example.edu',
  },
  {
    email: 'sam@example.edu',
    type: 'Sick',
    startDate: '2026-05-11',
    endDate: '2026-05-11',
    businessDays: 1,
    note: null,
    status: 'approved',
    decidedBy: 'maria@example.edu',
  },
  {
    email: 'sam@example.edu',
    type: 'Vacation',
    startDate: '2026-11-23',
    endDate: '2026-11-27',
    businessDays: 4,
    note: 'Thanksgiving week, driving to Chicago',
    status: 'pending',
    decidedBy: null,
  },
  {
    email: 'priya@example.edu',
    type: 'Vacation',
    startDate: '2026-07-06',
    endDate: '2026-07-10',
    businessDays: 5,
    note: null,
    status: 'approved',
    decidedBy: 'maria@example.edu',
  },
  {
    email: 'priya@example.edu',
    type: 'Vacation',
    startDate: '2026-08-17',
    endDate: '2026-08-21',
    businessDays: 5,
    note: 'Second week of August if it works',
    status: 'denied',
    managerNote: 'We have two people out that week already. Try the week after.',
    decidedBy: 'maria@example.edu',
  },
  {
    email: 'priya@example.edu',
    type: 'Personal',
    startDate: '2026-10-19',
    endDate: '2026-10-20',
    businessDays: 2,
    note: 'Moving apartments',
    status: 'pending',
    decidedBy: null,
  },
];

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // RESTART IDENTITY keeps ids stable across reseeds, which matters because the
    // identity switcher sends a hard-coded X-User-Id.
    await client.query('TRUNCATE leave_requests, users, leave_types RESTART IDENTITY CASCADE');

    const userIds = new Map();
    for (const user of users) {
      const { rows } = await client.query(
        'INSERT INTO users (name, email, role, manager_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [user.name, user.email, user.role, user.manager ? userIds.get(user.manager) : null]
      );
      userIds.set(user.email, rows[0].id);
    }

    const typeIds = new Map();
    for (const type of leaveTypes) {
      const { rows } = await client.query(
        'INSERT INTO leave_types (name, annual_allowance) VALUES ($1, $2) RETURNING id',
        [type.name, type.annualAllowance]
      );
      typeIds.set(type.name, rows[0].id);
    }

    for (const request of leaveRequests) {
      const decided = request.status !== 'pending';
      await client.query(
        `INSERT INTO leave_requests
           (user_id, type_id, start_date, end_date, business_days, note, status,
            manager_note, decided_at, decided_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userIds.get(request.email),
          typeIds.get(request.type),
          request.startDate,
          request.endDate,
          request.businessDays,
          request.note,
          request.status,
          request.managerNote ?? null,
          decided ? new Date() : null,
          decided ? userIds.get(request.decidedBy) : null,
        ]
      );
    }

    await client.query('COMMIT');
    console.warn(
      `seeded ${users.length} users, ${leaveTypes.length} leave types, ${leaveRequests.length} requests`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
