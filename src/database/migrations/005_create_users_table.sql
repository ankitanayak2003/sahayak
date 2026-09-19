BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_encrypted BYTEA,
  phone_number_blind_index TEXT,
  email TEXT,
  password_hash VARCHAR(60) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'volunteer',
  account_status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT users_role_check
    CHECK (role IN ('volunteer', 'police_admin')),
  CONSTRAINT users_account_status_check
    CHECK (account_status IN ('active', 'suspended', 'deleted')),
  CONSTRAINT users_phone_blind_index_check
    CHECK (
      phone_number_blind_index IS NULL
      OR phone_number_blind_index ~ '^[0-9a-fA-F]{64}$'
    ),
  CONSTRAINT users_phone_blind_index_unique
    UNIQUE (phone_number_blind_index)
);

CREATE UNIQUE INDEX users_email_unique_idx
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX users_role_account_status_idx
  ON users (role, account_status);

CREATE FUNCTION set_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_users_updated_at();

COMMIT;