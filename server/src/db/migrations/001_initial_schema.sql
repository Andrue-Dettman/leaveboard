CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('employee', 'manager')),
  manager_id INTEGER REFERENCES users (id)
);

CREATE TABLE leave_types (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  annual_allowance INTEGER NOT NULL CHECK (annual_allowance >= 0)
);

CREATE TABLE leave_requests (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users (id),
  type_id       INTEGER NOT NULL REFERENCES leave_types (id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  business_days INTEGER NOT NULL CHECK (business_days >= 0),
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  manager_note  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    INTEGER REFERENCES users (id),
  CONSTRAINT end_on_or_after_start CHECK (end_date >= start_date),
  -- A decision must carry both its timestamp and its author, or neither.
  CONSTRAINT decision_is_complete CHECK (
    (decided_at IS NULL AND decided_by IS NULL)
    OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)
  ),
  CONSTRAINT denial_requires_note CHECK (
    status <> 'denied' OR (manager_note IS NOT NULL AND manager_note <> '')
  )
);

CREATE INDEX leave_requests_user_id_idx ON leave_requests (user_id);
CREATE INDEX leave_requests_status_idx ON leave_requests (status);

CREATE TABLE holiday_cache (
  year       INTEGER NOT NULL,
  country    TEXT NOT NULL,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year, country)
);
