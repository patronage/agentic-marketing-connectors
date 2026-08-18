/**
 * SQL DDL for the Ads Sync control schema and reporting views.
 *
 * The control schema is provider-neutral. The reporting view definitions
 * normalize each provider's Airbyte output tables into the shared
 * `ads_sync_reporting` views listed by each provider module's
 * `reportingViews`.
 */
export const controlSchemaSql = `
CREATE SCHEMA IF NOT EXISTS ads_sync;
CREATE SCHEMA IF NOT EXISTS ads_sync_reporting;

CREATE TABLE IF NOT EXISTS ads_sync.sync_connections (
  id text PRIMARY KEY,
  provider text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  account_id text,
  source_identity jsonb,
  source_config_ref text,
  source_config_fingerprint text,
  state_config_ref text,
  configured_catalog_ref text,
  configured_catalog_hash text,
  selected_streams jsonb NOT NULL DEFAULT '[]'::jsonb,
  stream_group text NOT NULL DEFAULT '',
  stream_name text NOT NULL,
  airbyte_schema text NOT NULL,
  status text NOT NULL DEFAULT 'enabled',
  reporting_enabled boolean NOT NULL DEFAULT false,
  schedule_cron text,
  schedule_every_minutes integer,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_dispatch_succeeded_at timestamptz,
  last_dispatch_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS source_identity jsonb;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS source_config_ref text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS source_config_fingerprint text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS configured_catalog_ref text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS configured_catalog_hash text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS selected_streams jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS stream_group text NOT NULL DEFAULT '';
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS reporting_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS schedule_cron text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS schedule_every_minutes integer;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS state_config_ref text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS last_dispatch_succeeded_at timestamptz;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS last_dispatch_failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sync_connections_enabled_schema_idx
  ON ads_sync.sync_connections (airbyte_schema)
  WHERE status = 'enabled';

DROP INDEX IF EXISTS ads_sync.sync_connections_reporting_provider_idx;

CREATE UNIQUE INDEX IF NOT EXISTS sync_connections_enabled_reporting_provider_idx
  ON ads_sync.sync_connections (provider)
  WHERE reporting_enabled = true AND status = 'enabled';

CREATE INDEX IF NOT EXISTS sync_connections_due_idx
  ON ads_sync.sync_connections (next_run_at)
  WHERE status = 'enabled';

CREATE TABLE IF NOT EXISTS ads_sync.scheduler_tick_health (
  id text PRIMARY KEY,
  monitoring_started_at timestamptz NOT NULL DEFAULT now(),
  last_successful_tick_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ads_sync.scheduler_tick_health (id)
VALUES ('scheduled')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION ads_sync.lifecycle_evidence_is_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof(value) = 'object'
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(value) = 'object' THEN value
          ELSE '{}'::jsonb
        END
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(value) = 'object' THEN value
          ELSE '{}'::jsonb
        END
      ) AS entry
      WHERE entry.key NOT IN ('canary', 'backfill', 'comparison')
        OR jsonb_typeof(entry.value) <> 'object'
        OR (
          SELECT count(*)
          FROM jsonb_object_keys(
            CASE
              WHEN jsonb_typeof(entry.value) = 'object' THEN entry.value
              ELSE '{}'::jsonb
            END
          )
        ) <> 3
        OR NOT entry.value ?& ARRAY['completedAt', 'evidenceRef', 'runId']
        OR jsonb_typeof(entry.value -> 'completedAt') <> 'string'
        OR jsonb_typeof(entry.value -> 'evidenceRef') <> 'string'
        OR jsonb_typeof(entry.value -> 'runId') <> 'string'
        OR entry.value ->> 'completedAt' = ''
        OR entry.value ->> 'evidenceRef' = ''
        OR entry.value ->> 'runId' = ''
    )
$$;

CREATE OR REPLACE FUNCTION ads_sync.lifecycle_waivers_are_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof(value) = 'object'
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(value) = 'object' THEN value
          ELSE '{}'::jsonb
        END
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(value) = 'object' THEN value
          ELSE '{}'::jsonb
        END
      ) AS entry
      WHERE entry.key NOT IN ('canary', 'backfill', 'comparison')
        OR jsonb_typeof(entry.value) <> 'object'
        OR (
          SELECT count(*)
          FROM jsonb_object_keys(
            CASE
              WHEN jsonb_typeof(entry.value) = 'object' THEN entry.value
              ELSE '{}'::jsonb
            END
          )
        ) <> 3
        OR NOT entry.value ?& ARRAY['reason', 'authorizedBy', 'at']
        OR jsonb_typeof(entry.value -> 'reason') <> 'string'
        OR jsonb_typeof(entry.value -> 'authorizedBy') <> 'string'
        OR jsonb_typeof(entry.value -> 'at') <> 'string'
        OR entry.value ->> 'reason' = ''
        OR entry.value ->> 'authorizedBy' = ''
        OR entry.value ->> 'at' = ''
    )
$$;

CREATE TABLE IF NOT EXISTS ads_sync.lifecycle_transitions (
  id text PRIMARY KEY,
  from_state text,
  to_state text NOT NULL,
  kind text NOT NULL,
  plan_sha256 text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  waivers jsonb NOT NULL DEFAULT '{}'::jsonb,
  authorized_by text NOT NULL,
  authorization_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_transitions_from_state_chk CHECK (
    from_state IS NULL OR from_state IN ('scaffolded', 'canary', 'backfill', 'scheduled', 'paused')
  ),
  CONSTRAINT lifecycle_transitions_to_state_chk CHECK (
    to_state IN ('scaffolded', 'canary', 'backfill', 'scheduled', 'paused')
  ),
  CONSTRAINT lifecycle_transitions_kind_chk CHECK (
    kind IN ('transition', 'evidence', 'waiver')
  ),
  CONSTRAINT lifecycle_transitions_plan_sha256_chk CHECK (
    plan_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT lifecycle_transitions_payload_chk CHECK (
    (
      kind = 'transition'
      AND evidence = '{}'::jsonb
      AND waivers = '{}'::jsonb
      AND (
        from_state IS NOT NULL
        OR to_state = 'scaffolded'
      )
    )
    OR (
      kind = 'evidence'
      AND from_state = to_state
      AND ads_sync.lifecycle_evidence_is_valid(evidence)
      AND waivers = '{}'::jsonb
    )
    OR (
      kind = 'waiver'
      AND from_state = to_state
      AND evidence = '{}'::jsonb
      AND ads_sync.lifecycle_waivers_are_valid(waivers)
    )
  ),
  CONSTRAINT lifecycle_transitions_init_chk CHECK (
    from_state IS NOT NULL
    OR (
      kind = 'transition'
      AND to_state = 'scaffolded'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_transitions_single_init_idx
  ON ads_sync.lifecycle_transitions ((from_state IS NULL))
  WHERE from_state IS NULL;

CREATE OR REPLACE FUNCTION ads_sync.reject_lifecycle_transition_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ads Sync lifecycle transitions are append-only';
END
$$;

DROP TRIGGER IF EXISTS lifecycle_transitions_append_only
  ON ads_sync.lifecycle_transitions;
CREATE TRIGGER lifecycle_transitions_append_only
  BEFORE UPDATE OR DELETE ON ads_sync.lifecycle_transitions
  FOR EACH ROW
  EXECUTE FUNCTION ads_sync.reject_lifecycle_transition_mutation();

CREATE TABLE IF NOT EXISTS ads_sync.instance_lifecycle (
  id text PRIMARY KEY,
  state text NOT NULL,
  updated_by text NOT NULL,
  authorization_ref text NOT NULL,
  latest_transition_id text NOT NULL REFERENCES ads_sync.lifecycle_transitions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_lifecycle_singleton_chk CHECK (id = 'instance'),
  CONSTRAINT instance_lifecycle_state_chk CHECK (
    state IN ('scaffolded', 'canary', 'backfill', 'scheduled', 'paused')
  )
);

CREATE TABLE IF NOT EXISTS ads_sync.backfill_plans (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_group text,
  status text NOT NULL DEFAULT 'active',
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  window_step_days integer NOT NULL,
  max_windows_per_run integer NOT NULL,
  next_window_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  stop_reason text
);

ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS stream_group text;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS max_windows_per_run integer NOT NULL DEFAULT 1;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS next_window_start timestamptz;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS stop_reason text;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

UPDATE ads_sync.backfill_plans
SET window_end = window_start + interval '1 day'
WHERE window_end <= window_start;

UPDATE ads_sync.backfill_plans
SET window_step_days = 1
WHERE window_step_days <= 0;

UPDATE ads_sync.backfill_plans
SET max_windows_per_run = 1
WHERE max_windows_per_run <= 0;

UPDATE ads_sync.backfill_plans
SET next_window_start = window_start
WHERE next_window_start IS NULL;

ALTER TABLE ads_sync.backfill_plans
  ALTER COLUMN next_window_start SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backfill_plans_window_order_chk'
  ) THEN
    ALTER TABLE ads_sync.backfill_plans
      ADD CONSTRAINT backfill_plans_window_order_chk CHECK (window_start < window_end);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backfill_plans_window_step_days_chk'
  ) THEN
    ALTER TABLE ads_sync.backfill_plans
      ADD CONSTRAINT backfill_plans_window_step_days_chk CHECK (window_step_days > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backfill_plans_max_windows_per_run_chk'
  ) THEN
    ALTER TABLE ads_sync.backfill_plans
      ADD CONSTRAINT backfill_plans_max_windows_per_run_chk CHECK (max_windows_per_run > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS backfill_plans_active_connection_idx
  ON ads_sync.backfill_plans (connection_id, next_window_start)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS backfill_plans_active_window_idx
  ON ads_sync.backfill_plans (
    connection_id,
    COALESCE(stream_group, ''),
    window_start,
    window_end
  )
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS ads_sync.sync_run_windows (
  id text PRIMARY KEY,
  backfill_plan_id text NOT NULL REFERENCES ads_sync.backfill_plans(id),
  run_id text,
  connection_id text NOT NULL REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text
);

ALTER TABLE ads_sync.sync_run_windows
  ADD COLUMN IF NOT EXISTS run_id text;
ALTER TABLE ads_sync.sync_run_windows
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE ads_sync.sync_run_windows
  ADD COLUMN IF NOT EXISTS error_message text;

UPDATE ads_sync.sync_run_windows
SET window_end = window_start + interval '1 day'
WHERE window_end <= window_start;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_run_windows_window_order_chk'
  ) THEN
    ALTER TABLE ads_sync.sync_run_windows
      ADD CONSTRAINT sync_run_windows_window_order_chk CHECK (window_start < window_end);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sync_run_windows_plan_window_idx
  ON ads_sync.sync_run_windows (
    backfill_plan_id,
    connection_id,
    window_start,
    window_end
  );

CREATE TABLE IF NOT EXISTS ads_sync.sync_runs (
  id text PRIMARY KEY,
  connection_id text REFERENCES ads_sync.sync_connections(id),
  backfill_plan_id text REFERENCES ads_sync.backfill_plans(id),
  run_window_id text REFERENCES ads_sync.sync_run_windows(id),
  workflow_instance_id text,
  trigger_type text NOT NULL,
  requested_providers jsonb NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_type text,
  error_message text
);

ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);
ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS backfill_plan_id text REFERENCES ads_sync.backfill_plans(id);
ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS run_window_id text REFERENCES ads_sync.sync_run_windows(id);
ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS workflow_instance_id text;

CREATE TABLE IF NOT EXISTS ads_sync.sync_stream_runs (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  connection_id text REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  status text NOT NULL,
  source_record_count integer NOT NULL DEFAULT 0,
  state_count integer NOT NULL DEFAULT 0,
  generation_id bigint,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_type text,
  error_message text
);

ALTER TABLE ads_sync.sync_stream_runs
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);

CREATE TABLE IF NOT EXISTS ads_sync.sync_state_commits (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text NOT NULL REFERENCES ads_sync.sync_stream_runs(id),
  connection_id text REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  source_config_hash text,
  configured_catalog_hash text,
  state_json jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_state_commits
  ADD COLUMN IF NOT EXISTS source_config_hash text;

ALTER TABLE ads_sync.sync_state_commits
  ADD COLUMN IF NOT EXISTS configured_catalog_hash text;

ALTER TABLE ads_sync.sync_state_commits
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);

CREATE TABLE IF NOT EXISTS ads_sync.sync_generation_ledger (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text NOT NULL REFERENCES ads_sync.sync_stream_runs(id),
  connection_id text REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  generation_id bigint NOT NULL,
  sync_id bigint NOT NULL,
  minimum_generation_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_generation_ledger
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);

CREATE TABLE IF NOT EXISTS ads_sync.sync_artifacts (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text REFERENCES ads_sync.sync_stream_runs(id),
  provider text,
  artifact_kind text NOT NULL,
  r2_key text NOT NULL,
  content_type text,
  byte_length integer,
  sha256 text,
  line_count integer,
  record_count integer,
  state_count integer,
  log_count integer,
  trace_count integer,
  first_record_emitted_at timestamptz,
  last_record_emitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS line_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS record_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS state_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS log_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS trace_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS first_record_emitted_at timestamptz;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS last_record_emitted_at timestamptz;

CREATE TABLE IF NOT EXISTS ads_sync.sync_catalog_snapshots (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text REFERENCES ads_sync.sync_stream_runs(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  catalog_hash text,
  catalog_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_sync.sync_errors (
  id text PRIMARY KEY,
  run_id text REFERENCES ads_sync.sync_runs(id),
  stream_run_id text REFERENCES ads_sync.sync_stream_runs(id),
  provider text,
  error_type text NOT NULL,
  error_message text NOT NULL,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_sync.sync_stream_leases (
  lease_key text PRIMARY KEY,
  run_id text NOT NULL,
  stream_run_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_stream_runs_run_started_idx
  ON ads_sync.sync_stream_runs (run_id, started_at);

CREATE INDEX IF NOT EXISTS sync_stream_runs_provider_stream_status_idx
  ON ads_sync.sync_stream_runs (provider, stream_name, status);

CREATE INDEX IF NOT EXISTS sync_state_commits_provider_stream_hash_idx
  ON ads_sync.sync_state_commits (
    provider,
    stream_name,
    source_config_hash,
    configured_catalog_hash,
    committed_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS sync_state_commits_stream_run_idx
  ON ads_sync.sync_state_commits (stream_run_id);

CREATE INDEX IF NOT EXISTS sync_artifacts_run_stream_idx
  ON ads_sync.sync_artifacts (run_id, stream_run_id);

CREATE INDEX IF NOT EXISTS sync_errors_run_stream_created_idx
  ON ads_sync.sync_errors (run_id, stream_run_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS sync_catalog_snapshots_stream_run_idx
  ON ads_sync.sync_catalog_snapshots (stream_run_id)
  WHERE stream_run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sync_generation_ledger_provider_stream_generation_idx
  ON ads_sync.sync_generation_ledger (provider, stream_name, generation_id);

CREATE UNIQUE INDEX IF NOT EXISTS sync_generation_ledger_connection_stream_generation_idx
  ON ads_sync.sync_generation_ledger (connection_id, stream_name, generation_id)
  WHERE connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sync_artifacts_stream_kind_idx
  ON ads_sync.sync_artifacts (stream_run_id, artifact_kind)
  WHERE stream_run_id IS NOT NULL;
`;

/**
 * A deterministic, read-only snapshot of the immutable control schema plus
 * the bootstrap-owned schema and grant boundaries. Reporting views/functions
 * are refreshed after connector writes and are intentionally outside this
 * control-schema marker. The migration records this value after creation and
 * runtime checks compare the live catalog with that record.
 */
export const controlSchemaCatalogSnapshotSql = `
SELECT jsonb_build_object(
  'schemas', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', namespace.nspname,
      'owner', pg_get_userbyid(namespace.nspowner),
      'acl', COALESCE((
        SELECT jsonb_agg(acl::text ORDER BY acl::text)
        FROM unnest(namespace.nspacl) AS acl
      ), '[]'::jsonb)
    ) ORDER BY namespace.nspname)
    FROM pg_namespace AS namespace
    WHERE namespace.nspname IN (
      'ads_sync',
      'ads_sync_reporting',
      'airbyte_internal',
      'airbyte_google_ads',
      'airbyte_meta_ads',
      'airbyte_meta_ads_metadata'
    )
  ), '[]'::jsonb),
  'relations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'name', relation.relname,
      'kind', relation.relkind,
      'owner', pg_get_userbyid(relation.relowner),
      'persistence', relation.relpersistence,
      'rowSecurity', relation.relrowsecurity,
      'forceRowSecurity', relation.relforcerowsecurity,
      'acl', COALESCE((
        SELECT jsonb_agg(acl::text ORDER BY acl::text)
        FROM unnest(relation.relacl) AS acl
      ), '[]'::jsonb),
      'viewDefinition', CASE
        WHEN relation.relkind IN ('v', 'm') THEN pg_get_viewdef(relation.oid, true)
        ELSE NULL
      END
    ) ORDER BY namespace.nspname, relation.relname)
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'ads_sync'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  ), '[]'::jsonb),
  'columns', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'relation', relation.relname,
      'position', attribute.attnum,
      'name', attribute.attname,
      'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'notNull', attribute.attnotnull,
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'default', pg_get_expr(default_value.adbin, default_value.adrelid),
      'collation', CASE
        WHEN attribute.attcollation = 0 THEN NULL
        ELSE collation_namespace.nspname || '.' || collation_row.collname
      END
    ) ORDER BY namespace.nspname, relation.relname, attribute.attnum)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
    LEFT JOIN pg_collation AS collation_row
      ON collation_row.oid = attribute.attcollation
    LEFT JOIN pg_namespace AS collation_namespace
      ON collation_namespace.oid = collation_row.collnamespace
    WHERE namespace.nspname = 'ads_sync'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ), '[]'::jsonb),
  'constraints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'relation', relation.relname,
      'name', constraint_row.conname,
      'type', constraint_row.contype,
      'definition', pg_get_constraintdef(constraint_row.oid, true),
      'validated', constraint_row.convalidated,
      'deferrable', constraint_row.condeferrable,
      'deferred', constraint_row.condeferred
    ) ORDER BY namespace.nspname, relation.relname, constraint_row.conname)
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'ads_sync'
  ), '[]'::jsonb),
  'indexes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'relation', relation.relname,
      'name', index_relation.relname,
      'definition', pg_get_indexdef(index_row.indexrelid),
      'valid', index_row.indisvalid,
      'ready', index_row.indisready,
      'live', index_row.indislive
    ) ORDER BY namespace.nspname, relation.relname, index_relation.relname)
    FROM pg_index AS index_row
    JOIN pg_class AS relation ON relation.oid = index_row.indrelid
    JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'ads_sync'
  ), '[]'::jsonb),
  'functions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'name', procedure_row.proname,
      'identityArguments', pg_get_function_identity_arguments(procedure_row.oid),
      'owner', pg_get_userbyid(procedure_row.proowner),
      'definition', pg_get_functiondef(procedure_row.oid)
    ) ORDER BY namespace.nspname, procedure_row.proname, pg_get_function_identity_arguments(procedure_row.oid))
    FROM pg_proc AS procedure_row
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_row.pronamespace
    WHERE namespace.nspname = 'ads_sync'
  ), '[]'::jsonb),
  'defaultPrivileges', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'owner', owner.rolname,
      'objectType', default_acl.defaclobjtype,
      'acl', COALESCE((
        SELECT jsonb_agg(acl::text ORDER BY acl::text)
        FROM unnest(default_acl.defaclacl) AS acl
      ), '[]'::jsonb)
    ) ORDER BY namespace.nspname, owner.rolname, default_acl.defaclobjtype)
    FROM pg_default_acl AS default_acl
    JOIN pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
    JOIN pg_roles AS owner ON owner.oid = default_acl.defaclrole
    WHERE namespace.nspname IN (
      'ads_sync',
      'ads_sync_reporting',
      'airbyte_internal',
      'airbyte_google_ads',
      'airbyte_meta_ads',
      'airbyte_meta_ads_metadata'
    )
  ), '[]'::jsonb)
) AS catalog_snapshot
`;

export const requiredReportingViewTables = [] as const;

export const reportingViewSql = `
CREATE OR REPLACE FUNCTION ads_sync_reporting.airbyte_action_sum(
  actions jsonb,
  action_types text[]
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(SUM((entry ->> 'value')::numeric), 0)
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(actions) = 'array' THEN actions
      ELSE '[]'::jsonb
    END
  ) AS entry
  WHERE entry ->> 'action_type' = ANY(action_types)
$$;

CREATE OR REPLACE FUNCTION ads_sync_reporting.airbyte_action_total(
  actions jsonb
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(SUM((entry ->> 'value')::numeric), 0)
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(actions) = 'array' THEN actions
      ELSE '[]'::jsonb
    END
  ) AS entry
$$;

DROP VIEW IF EXISTS ads_sync_reporting.ads_ad_daily;
DROP VIEW IF EXISTS ads_sync_reporting.meta_ad_creative_context;
DROP VIEW IF EXISTS ads_sync_reporting.ads_group_daily;
DROP VIEW IF EXISTS ads_sync_reporting.ads_campaign_daily;
DROP VIEW IF EXISTS ads_sync_reporting.gsc_query_page_daily;

DO $$
DECLARE
  google_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
  meta_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
BEGIN
  IF to_regclass('airbyte_google_ads.campaign_daily_performance') IS NOT NULL THEN
    google_rows_sql := 'SELECT to_jsonb(g) AS row FROM airbyte_google_ads.campaign_daily_performance AS g';
  END IF;

  IF to_regclass('airbyte_meta_ads.customcampaign_daily_performance') IS NOT NULL THEN
    meta_rows_sql := 'SELECT to_jsonb(m) AS row FROM airbyte_meta_ads.customcampaign_daily_performance AS m';
  END IF;

  EXECUTE format($view$
    CREATE OR REPLACE VIEW ads_sync_reporting.ads_campaign_daily AS
    WITH google_rows AS (
      %s
    ),
    google_normalized AS (
      SELECT
        'google_ads'::text AS platform,
        row ->> 'customer_id' AS account_id,
        row ->> 'customer_descriptive_name' AS account_name,
        (row ->> 'segments_date')::date AS date_day,
        row ->> 'campaign_id' AS campaign_id,
        row ->> 'campaign_name' AS campaign_name,
        row ->> 'campaign_status' AS campaign_status,
        NULLIF(row ->> 'metrics_impressions', '')::numeric AS impressions,
        NULLIF(row ->> 'metrics_clicks', '')::numeric AS clicks,
        NULLIF(row ->> 'metrics_cost_micros', '')::numeric / 1000000.0 AS spend,
        NULLIF(row ->> 'metrics_conversions', '')::numeric AS conversions,
        NULLIF(row ->> 'metrics_conversions_value', '')::numeric AS conversions_value,
        row ->> 'customer_currency_code' AS currency_code,
        'airbyte_google_ads.campaign_daily_performance'::text AS source_table,
        row ->> '_airbyte_generation_id' AS source_generation_id,
        NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
        row ->> '_airbyte_raw_id' AS raw_record_id
      FROM google_rows
    ),
    google_deduped AS (
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        campaign_status,
        impressions,
        clicks,
        spend,
        conversions,
        conversions_value,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          google_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, campaign_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM google_normalized
      ) AS ranked_google
      WHERE row_rank = 1
    ),
    meta_rows AS (
      %s
    ),
    meta_normalized AS (
      SELECT
        'meta_ads'::text AS platform,
        row ->> 'account_id' AS account_id,
        row ->> 'account_name' AS account_name,
        (row ->> 'date_start')::date AS date_day,
        row ->> 'campaign_id' AS campaign_id,
        row ->> 'campaign_name' AS campaign_name,
        row ->> 'campaign_status' AS campaign_status,
        NULLIF(row ->> 'impressions', '')::numeric AS impressions,
        NULLIF(row ->> 'clicks', '')::numeric AS clicks,
        NULLIF(row ->> 'spend', '')::numeric AS spend,
        ads_sync_reporting.airbyte_action_sum(row -> 'actions', ARRAY[
          'lead',
          'onsite_conversion.lead_grouped',
          'offsite_conversion.fb_pixel_lead',
          'purchase',
          'offsite_conversion.fb_pixel_purchase'
        ]) AS conversions,
        ads_sync_reporting.airbyte_action_sum(row -> 'action_values', ARRAY[
          'lead',
          'onsite_conversion.lead_grouped',
          'offsite_conversion.fb_pixel_lead',
          'purchase',
          'offsite_conversion.fb_pixel_purchase'
        ]) AS conversions_value,
        row ->> 'account_currency' AS currency_code,
        'airbyte_meta_ads.customcampaign_daily_performance'::text AS source_table,
        row ->> '_airbyte_generation_id' AS source_generation_id,
        NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
        row ->> '_airbyte_raw_id' AS raw_record_id
      FROM meta_rows
    ),
    meta_deduped AS (
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        campaign_status,
        impressions,
        clicks,
        spend,
        conversions,
        conversions_value,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          meta_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, campaign_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM meta_normalized
      ) AS ranked_meta
      WHERE row_rank = 1
    )
    SELECT
      platform,
      account_id,
      account_name,
      date_day,
      campaign_id,
      campaign_name,
      campaign_status,
      impressions,
      clicks,
      spend,
      conversions,
      conversions_value,
      currency_code,
      source_table,
      source_generation_id,
      extracted_at,
      raw_record_id
    FROM google_deduped
    UNION ALL
    SELECT
      platform,
      account_id,
      account_name,
      date_day,
      campaign_id,
      campaign_name,
      campaign_status,
      impressions,
      clicks,
      spend,
      conversions,
      conversions_value,
      currency_code,
      source_table,
      source_generation_id,
      extracted_at,
      raw_record_id
    FROM meta_deduped
  $view$, google_rows_sql, meta_rows_sql);
END $$;

DO $$
BEGIN
  IF to_regclass('airbyte_meta_ads.customadset_daily_performance') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_group_daily AS
      WITH meta_rows AS (
        SELECT to_jsonb(m) AS row
        FROM airbyte_meta_ads.customadset_daily_performance AS m
      ),
      meta_normalized AS (
        SELECT
          'meta_ads'::text AS platform,
          row ->> 'account_id' AS account_id,
          row ->> 'account_name' AS account_name,
          (row ->> 'date_start')::date AS date_day,
          row ->> 'campaign_id' AS campaign_id,
          row ->> 'campaign_name' AS campaign_name,
          row ->> 'adset_id' AS group_id,
          row ->> 'adset_name' AS group_name,
          NULL::text AS group_status,
          row ->> 'optimization_goal' AS optimization_goal,
          NULLIF(row ->> 'impressions', '')::numeric AS impressions,
          NULLIF(row ->> 'reach', '')::numeric AS reach,
          NULLIF(row ->> 'frequency', '')::numeric AS frequency,
          NULLIF(row ->> 'clicks', '')::numeric AS clicks,
          NULLIF(row ->> 'ctr', '')::numeric AS ctr,
          NULLIF(row ->> 'cpc', '')::numeric AS cpc,
          NULLIF(row ->> 'cpm', '')::numeric AS cpm,
          NULLIF(row ->> 'spend', '')::numeric AS spend,
          NULLIF(row ->> 'unique_clicks', '')::numeric AS unique_clicks,
          NULLIF(row ->> 'unique_ctr', '')::numeric AS unique_ctr,
          NULLIF(row ->> 'inline_link_clicks', '')::numeric AS inline_link_clicks,
          NULLIF(row ->> 'inline_link_click_ctr', '')::numeric AS inline_link_click_ctr,
          NULLIF(row ->> 'cost_per_inline_link_click', '')::numeric AS cost_per_inline_link_click,
          row -> 'actions' AS actions,
          row -> 'action_values' AS action_values,
          row -> 'cost_per_action_type' AS cost_per_action_type,
          row -> 'unique_actions' AS unique_actions,
          row -> 'cost_per_unique_action_type' AS cost_per_unique_action_type,
          row -> 'outbound_clicks' AS outbound_clicks,
          row -> 'outbound_clicks_ctr' AS outbound_clicks_ctr,
          row -> 'cost_per_outbound_click' AS cost_per_outbound_click,
          row -> 'website_purchase_roas' AS website_purchase_roas,
          ads_sync_reporting.airbyte_action_sum(row -> 'actions', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions,
          ads_sync_reporting.airbyte_action_sum(row -> 'action_values', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions_value,
          ads_sync_reporting.airbyte_action_total(row -> 'video_continuous_2_sec_watched_actions') AS video_2_sec_views,
          ads_sync_reporting.airbyte_action_total(row -> 'video_thruplay_watched_actions') AS thruplays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_play_actions') AS video_plays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_avg_time_watched_actions') AS video_avg_time_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p25_watched_actions') AS video_p25_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p50_watched_actions') AS video_p50_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p75_watched_actions') AS video_p75_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p95_watched_actions') AS video_p95_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p100_watched_actions') AS video_p100_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'cost_per_thruplay') AS cost_per_thruplay,
          NULLIF(row ->> 'inline_post_engagement', '')::numeric AS inline_post_engagement,
          row ->> 'account_currency' AS currency_code,
          'airbyte_meta_ads.customadset_daily_performance'::text AS source_table,
          row ->> '_airbyte_generation_id' AS source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
          row ->> '_airbyte_raw_id' AS raw_record_id
        FROM meta_rows
      )
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        group_id,
        group_name,
        group_status,
        optimization_goal,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        spend,
        unique_clicks,
        unique_ctr,
        inline_link_clicks,
        inline_link_click_ctr,
        cost_per_inline_link_click,
        actions,
        action_values,
        cost_per_action_type,
        unique_actions,
        cost_per_unique_action_type,
        outbound_clicks,
        outbound_clicks_ctr,
        cost_per_outbound_click,
        website_purchase_roas,
        conversions,
        conversions_value,
        video_2_sec_views,
        CASE
          WHEN impressions > 0 THEN video_2_sec_views / impressions
          ELSE NULL
        END AS hook_rate,
        thruplays,
        video_plays,
        video_avg_time_watched,
        video_p25_watched,
        video_p50_watched,
        video_p75_watched,
        video_p95_watched,
        video_p100_watched,
        cost_per_thruplay,
        inline_post_engagement,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          meta_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, group_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM meta_normalized
      ) AS ranked_meta
      WHERE row_rank = 1
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_group_daily AS
      SELECT
        NULL::text AS platform,
        NULL::text AS account_id,
        NULL::text AS account_name,
        NULL::date AS date_day,
        NULL::text AS campaign_id,
        NULL::text AS campaign_name,
        NULL::text AS group_id,
        NULL::text AS group_name,
        NULL::text AS group_status,
        NULL::text AS optimization_goal,
        NULL::numeric AS impressions,
        NULL::numeric AS reach,
        NULL::numeric AS frequency,
        NULL::numeric AS clicks,
        NULL::numeric AS ctr,
        NULL::numeric AS cpc,
        NULL::numeric AS cpm,
        NULL::numeric AS spend,
        NULL::numeric AS unique_clicks,
        NULL::numeric AS unique_ctr,
        NULL::numeric AS inline_link_clicks,
        NULL::numeric AS inline_link_click_ctr,
        NULL::numeric AS cost_per_inline_link_click,
        NULL::jsonb AS actions,
        NULL::jsonb AS action_values,
        NULL::jsonb AS cost_per_action_type,
        NULL::jsonb AS unique_actions,
        NULL::jsonb AS cost_per_unique_action_type,
        NULL::jsonb AS outbound_clicks,
        NULL::jsonb AS outbound_clicks_ctr,
        NULL::jsonb AS cost_per_outbound_click,
        NULL::jsonb AS website_purchase_roas,
        NULL::numeric AS conversions,
        NULL::numeric AS conversions_value,
        NULL::numeric AS video_2_sec_views,
        NULL::numeric AS hook_rate,
        NULL::numeric AS thruplays,
        NULL::numeric AS video_plays,
        NULL::numeric AS video_avg_time_watched,
        NULL::numeric AS video_p25_watched,
        NULL::numeric AS video_p50_watched,
        NULL::numeric AS video_p75_watched,
        NULL::numeric AS video_p95_watched,
        NULL::numeric AS video_p100_watched,
        NULL::numeric AS cost_per_thruplay,
        NULL::numeric AS inline_post_engagement,
        NULL::text AS currency_code,
        NULL::text AS source_table,
        NULL::text AS source_generation_id,
        NULL::timestamptz AS extracted_at,
        NULL::text AS raw_record_id
      WHERE false
    $view$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('airbyte_meta_ads.customad_daily_performance') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_ad_daily AS
      WITH meta_rows AS (
        SELECT to_jsonb(m) AS row
        FROM airbyte_meta_ads.customad_daily_performance AS m
      ),
      meta_normalized AS (
        SELECT
          'meta_ads'::text AS platform,
          row ->> 'account_id' AS account_id,
          row ->> 'account_name' AS account_name,
          (row ->> 'date_start')::date AS date_day,
          row ->> 'campaign_id' AS campaign_id,
          row ->> 'campaign_name' AS campaign_name,
          row ->> 'adset_id' AS group_id,
          row ->> 'adset_name' AS group_name,
          row ->> 'ad_id' AS ad_id,
          row ->> 'ad_name' AS ad_name,
          NULL::text AS ad_status,
          NULLIF(row ->> 'impressions', '')::numeric AS impressions,
          NULLIF(row ->> 'reach', '')::numeric AS reach,
          NULLIF(row ->> 'frequency', '')::numeric AS frequency,
          NULLIF(row ->> 'clicks', '')::numeric AS clicks,
          NULLIF(row ->> 'ctr', '')::numeric AS ctr,
          NULLIF(row ->> 'cpc', '')::numeric AS cpc,
          NULLIF(row ->> 'cpm', '')::numeric AS cpm,
          NULLIF(row ->> 'spend', '')::numeric AS spend,
          NULLIF(row ->> 'unique_clicks', '')::numeric AS unique_clicks,
          NULLIF(row ->> 'unique_ctr', '')::numeric AS unique_ctr,
          NULLIF(row ->> 'inline_link_clicks', '')::numeric AS inline_link_clicks,
          NULLIF(row ->> 'inline_link_click_ctr', '')::numeric AS inline_link_click_ctr,
          NULLIF(row ->> 'cost_per_inline_link_click', '')::numeric AS cost_per_inline_link_click,
          row -> 'actions' AS actions,
          row -> 'action_values' AS action_values,
          row -> 'cost_per_action_type' AS cost_per_action_type,
          row -> 'unique_actions' AS unique_actions,
          row -> 'cost_per_unique_action_type' AS cost_per_unique_action_type,
          row -> 'outbound_clicks' AS outbound_clicks,
          row -> 'outbound_clicks_ctr' AS outbound_clicks_ctr,
          row -> 'cost_per_outbound_click' AS cost_per_outbound_click,
          row -> 'website_purchase_roas' AS website_purchase_roas,
          ads_sync_reporting.airbyte_action_sum(row -> 'actions', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions,
          ads_sync_reporting.airbyte_action_sum(row -> 'action_values', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions_value,
          ads_sync_reporting.airbyte_action_total(row -> 'video_continuous_2_sec_watched_actions') AS video_2_sec_views,
          ads_sync_reporting.airbyte_action_total(row -> 'video_thruplay_watched_actions') AS thruplays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_play_actions') AS video_plays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_avg_time_watched_actions') AS video_avg_time_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p25_watched_actions') AS video_p25_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p50_watched_actions') AS video_p50_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p75_watched_actions') AS video_p75_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p95_watched_actions') AS video_p95_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p100_watched_actions') AS video_p100_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'cost_per_thruplay') AS cost_per_thruplay,
          NULLIF(row ->> 'inline_post_engagement', '')::numeric AS inline_post_engagement,
          row ->> 'quality_ranking' AS quality_ranking,
          row ->> 'engagement_rate_ranking' AS engagement_rate_ranking,
          row ->> 'conversion_rate_ranking' AS conversion_rate_ranking,
          row ->> 'account_currency' AS currency_code,
          'airbyte_meta_ads.customad_daily_performance'::text AS source_table,
          row ->> '_airbyte_generation_id' AS source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
          row ->> '_airbyte_raw_id' AS raw_record_id
        FROM meta_rows
      )
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        group_id,
        group_name,
        ad_id,
        ad_name,
        ad_status,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        spend,
        unique_clicks,
        unique_ctr,
        inline_link_clicks,
        inline_link_click_ctr,
        cost_per_inline_link_click,
        actions,
        action_values,
        cost_per_action_type,
        unique_actions,
        cost_per_unique_action_type,
        outbound_clicks,
        outbound_clicks_ctr,
        cost_per_outbound_click,
        website_purchase_roas,
        conversions,
        conversions_value,
        video_2_sec_views,
        CASE
          WHEN impressions > 0 THEN video_2_sec_views / impressions
          ELSE NULL
        END AS hook_rate,
        thruplays,
        video_plays,
        video_avg_time_watched,
        video_p25_watched,
        video_p50_watched,
        video_p75_watched,
        video_p95_watched,
        video_p100_watched,
        cost_per_thruplay,
        inline_post_engagement,
        quality_ranking,
        engagement_rate_ranking,
        conversion_rate_ranking,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          meta_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, ad_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM meta_normalized
      ) AS ranked_meta
      WHERE row_rank = 1
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_ad_daily AS
      SELECT
        NULL::text AS platform,
        NULL::text AS account_id,
        NULL::text AS account_name,
        NULL::date AS date_day,
        NULL::text AS campaign_id,
        NULL::text AS campaign_name,
        NULL::text AS group_id,
        NULL::text AS group_name,
        NULL::text AS ad_id,
        NULL::text AS ad_name,
        NULL::text AS ad_status,
        NULL::numeric AS impressions,
        NULL::numeric AS reach,
        NULL::numeric AS frequency,
        NULL::numeric AS clicks,
        NULL::numeric AS ctr,
        NULL::numeric AS cpc,
        NULL::numeric AS cpm,
        NULL::numeric AS spend,
        NULL::numeric AS unique_clicks,
        NULL::numeric AS unique_ctr,
        NULL::numeric AS inline_link_clicks,
        NULL::numeric AS inline_link_click_ctr,
        NULL::numeric AS cost_per_inline_link_click,
        NULL::jsonb AS actions,
        NULL::jsonb AS action_values,
        NULL::jsonb AS cost_per_action_type,
        NULL::jsonb AS unique_actions,
        NULL::jsonb AS cost_per_unique_action_type,
        NULL::jsonb AS outbound_clicks,
        NULL::jsonb AS outbound_clicks_ctr,
        NULL::jsonb AS cost_per_outbound_click,
        NULL::jsonb AS website_purchase_roas,
        NULL::numeric AS conversions,
        NULL::numeric AS conversions_value,
        NULL::numeric AS video_2_sec_views,
        NULL::numeric AS hook_rate,
        NULL::numeric AS thruplays,
        NULL::numeric AS video_plays,
        NULL::numeric AS video_avg_time_watched,
        NULL::numeric AS video_p25_watched,
        NULL::numeric AS video_p50_watched,
        NULL::numeric AS video_p75_watched,
        NULL::numeric AS video_p95_watched,
        NULL::numeric AS video_p100_watched,
        NULL::numeric AS cost_per_thruplay,
        NULL::numeric AS inline_post_engagement,
        NULL::text AS quality_ranking,
        NULL::text AS engagement_rate_ranking,
        NULL::text AS conversion_rate_ranking,
        NULL::text AS currency_code,
        NULL::text AS source_table,
        NULL::text AS source_generation_id,
        NULL::timestamptz AS extracted_at,
        NULL::text AS raw_record_id
      WHERE false
    $view$;
  END IF;
END $$;

DO $$
DECLARE
  image_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
  video_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
BEGIN
  IF to_regclass('airbyte_meta_ads_metadata.images') IS NOT NULL THEN
    image_rows_sql := 'SELECT to_jsonb(i) AS row FROM airbyte_meta_ads_metadata.images AS i';
  END IF;

  IF to_regclass('airbyte_meta_ads_metadata.videos') IS NOT NULL THEN
    video_rows_sql := 'SELECT to_jsonb(v) AS row FROM airbyte_meta_ads_metadata.videos AS v';
  END IF;

  IF to_regclass('airbyte_meta_ads_metadata.ads') IS NOT NULL
    AND to_regclass('airbyte_meta_ads_metadata.ad_creatives') IS NOT NULL THEN
    EXECUTE format($view$
      CREATE OR REPLACE VIEW ads_sync_reporting.meta_ad_creative_context AS
      WITH ad_rows AS (
        SELECT to_jsonb(a) AS row
        FROM airbyte_meta_ads_metadata.ads AS a
      ),
      ad_normalized AS (
        SELECT
          row ->> 'account_id' AS account_id,
          row ->> 'campaign_id' AS campaign_id,
          row ->> 'adset_id' AS group_id,
          row ->> 'id' AS ad_id,
          row ->> 'name' AS ad_name,
          row ->> 'status' AS ad_status,
          row ->> 'effective_status' AS effective_ad_status,
          row ->> 'configured_status' AS configured_ad_status,
          COALESCE(
            row #>> '{creative,id}',
            row #>> '{creative,creative_id}',
            row ->> 'creative_id',
            row ->> 'ad_creative_id'
          ) AS creative_id,
          row ->> 'preview_shareable_link' AS ad_preview_url,
          row ->> '_airbyte_generation_id' AS ad_source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS ad_extracted_at,
          row ->> '_airbyte_raw_id' AS ad_raw_record_id
        FROM ad_rows
      ),
      latest_ads AS (
        SELECT *
        FROM (
          SELECT
            ad_normalized.*,
            row_number() OVER (
              PARTITION BY ad_id
              ORDER BY ad_extracted_at DESC NULLS LAST, ad_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM ad_normalized
        ) AS ranked_ads
        WHERE row_rank = 1
      ),
      creative_rows AS (
        SELECT to_jsonb(c) AS row
        FROM airbyte_meta_ads_metadata.ad_creatives AS c
      ),
      creative_normalized AS (
        SELECT
          row ->> 'account_id' AS account_id,
          row ->> 'id' AS creative_id,
          row ->> 'name' AS creative_name,
          row ->> 'status' AS creative_status,
          row ->> 'actor_id' AS actor_id,
          row ->> 'object_story_id' AS object_story_id,
          row ->> 'effective_object_story_id' AS effective_object_story_id,
          row ->> 'object_url' AS object_url,
          row ->> 'instagram_permalink_url' AS instagram_permalink_url,
          row ->> 'body' AS creative_body,
          row ->> 'title' AS creative_title,
          row ->> 'link_url' AS creative_link_url,
          row ->> 'thumbnail_url' AS thumbnail_url,
          row ->> 'image_url' AS image_url,
          COALESCE(
            row ->> 'image_hash',
            row #>> '{object_story_spec,link_data,image_hash}',
            row #>> '{asset_feed_spec,images,0,hash}'
          ) AS image_hash,
          COALESCE(
            row ->> 'video_id',
            row #>> '{object_story_spec,video_data,video_id}',
            row #>> '{asset_feed_spec,videos,0,video_id}'
          ) AS creative_video_id,
          row ->> 'call_to_action_type' AS creative_call_to_action_type,
          row -> 'object_story_spec' AS object_story_spec,
          row -> 'asset_feed_spec' AS asset_feed_spec,
          row ->> '_airbyte_generation_id' AS creative_source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS creative_extracted_at,
          row ->> '_airbyte_raw_id' AS creative_raw_record_id
        FROM creative_rows
      ),
      latest_creatives AS (
        SELECT *
        FROM (
          SELECT
            creative_normalized.*,
            row_number() OVER (
              PARTITION BY creative_id
              ORDER BY creative_extracted_at DESC NULLS LAST, creative_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM creative_normalized
        ) AS ranked_creatives
        WHERE row_rank = 1
      ),
      image_rows AS (
        %s
      ),
      image_normalized AS (
        SELECT
          row ->> 'hash' AS image_hash,
          COALESCE(row ->> 'url', row ->> 'url_128', row ->> 'permalink_url') AS image_url,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS image_extracted_at,
          row ->> '_airbyte_raw_id' AS image_raw_record_id
        FROM image_rows
      ),
      latest_images AS (
        SELECT *
        FROM (
          SELECT
            image_normalized.*,
            row_number() OVER (
              PARTITION BY image_hash
              ORDER BY image_extracted_at DESC NULLS LAST, image_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM image_normalized
        ) AS ranked_images
        WHERE row_rank = 1
      ),
      video_rows AS (
        %s
      ),
      video_normalized AS (
        SELECT
          row ->> 'id' AS video_id,
          row ->> 'permalink_url' AS video_permalink_url,
          COALESCE(
            row ->> 'picture',
            row #>> '{thumbnails,0,uri}',
            row #>> '{format,0,picture}'
          ) AS video_thumbnail_url,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS video_extracted_at,
          row ->> '_airbyte_raw_id' AS video_raw_record_id
        FROM video_rows
      ),
      latest_videos AS (
        SELECT *
        FROM (
          SELECT
            video_normalized.*,
            row_number() OVER (
              PARTITION BY video_id
              ORDER BY video_extracted_at DESC NULLS LAST, video_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM video_normalized
        ) AS ranked_videos
        WHERE row_rank = 1
      )
      SELECT
        'meta_ads'::text AS platform,
        latest_ads.account_id,
        latest_ads.campaign_id,
        latest_ads.group_id,
        latest_ads.ad_id,
        latest_ads.ad_name,
        latest_ads.ad_status,
        latest_ads.effective_ad_status,
        latest_ads.configured_ad_status,
        latest_ads.creative_id,
        latest_creatives.creative_name,
        latest_creatives.creative_status,
        COALESCE(
          latest_creatives.actor_id,
          NULLIF(
            split_part(
              COALESCE(
                latest_creatives.effective_object_story_id,
                latest_creatives.object_story_id
              ),
              '_',
              1
            ),
            ''
          )
        ) AS page_id,
        latest_creatives.object_story_id,
        latest_creatives.effective_object_story_id,
        COALESCE(
          latest_creatives.effective_object_story_id,
          latest_creatives.object_story_id
        ) AS post_id,
        COALESCE(
          latest_creatives.instagram_permalink_url,
          latest_creatives.object_url
        ) AS post_permalink_url,
        latest_ads.ad_preview_url,
        latest_creatives.creative_body,
        latest_creatives.creative_title,
        latest_creatives.creative_link_url,
        COALESCE(
          latest_creatives.thumbnail_url,
          latest_creatives.image_url,
          latest_images.image_url,
          latest_videos.video_thumbnail_url
        ) AS creative_thumbnail_url,
        latest_creatives.creative_call_to_action_type,
        latest_creatives.creative_video_id,
        latest_creatives.image_hash,
        COALESCE(latest_creatives.image_url, latest_images.image_url) AS image_url,
        latest_videos.video_id,
        latest_videos.video_permalink_url,
        latest_videos.video_thumbnail_url,
        latest_creatives.object_story_spec,
        latest_creatives.asset_feed_spec,
        latest_ads.ad_source_generation_id,
        latest_creatives.creative_source_generation_id,
        latest_ads.ad_extracted_at,
        latest_creatives.creative_extracted_at,
        GREATEST(
          latest_ads.ad_extracted_at,
          latest_creatives.creative_extracted_at
        ) AS extracted_at,
        latest_ads.ad_raw_record_id,
        latest_creatives.creative_raw_record_id,
        ARRAY[
          'airbyte_meta_ads_metadata.ads',
          'airbyte_meta_ads_metadata.ad_creatives'
        ]::text[] AS source_tables
      FROM latest_ads
      LEFT JOIN latest_creatives
        ON latest_creatives.creative_id = latest_ads.creative_id
        AND (
          latest_creatives.account_id = latest_ads.account_id
          OR latest_creatives.account_id IS NULL
          OR latest_ads.account_id IS NULL
        )
      LEFT JOIN latest_images
        ON latest_images.image_hash = latest_creatives.image_hash
      LEFT JOIN latest_videos
        ON latest_videos.video_id = latest_creatives.creative_video_id
    $view$, image_rows_sql, video_rows_sql);
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.meta_ad_creative_context AS
      SELECT
        NULL::text AS platform,
        NULL::text AS account_id,
        NULL::text AS campaign_id,
        NULL::text AS group_id,
        NULL::text AS ad_id,
        NULL::text AS ad_name,
        NULL::text AS ad_status,
        NULL::text AS effective_ad_status,
        NULL::text AS configured_ad_status,
        NULL::text AS creative_id,
        NULL::text AS creative_name,
        NULL::text AS creative_status,
        NULL::text AS page_id,
        NULL::text AS object_story_id,
        NULL::text AS effective_object_story_id,
        NULL::text AS post_id,
        NULL::text AS post_permalink_url,
        NULL::text AS ad_preview_url,
        NULL::text AS creative_body,
        NULL::text AS creative_title,
        NULL::text AS creative_link_url,
        NULL::text AS creative_thumbnail_url,
        NULL::text AS creative_call_to_action_type,
        NULL::text AS creative_video_id,
        NULL::text AS image_hash,
        NULL::text AS image_url,
        NULL::text AS video_id,
        NULL::text AS video_permalink_url,
        NULL::text AS video_thumbnail_url,
        NULL::jsonb AS object_story_spec,
        NULL::jsonb AS asset_feed_spec,
        NULL::text AS ad_source_generation_id,
        NULL::text AS creative_source_generation_id,
        NULL::timestamptz AS ad_extracted_at,
        NULL::timestamptz AS creative_extracted_at,
        NULL::timestamptz AS extracted_at,
        NULL::text AS ad_raw_record_id,
        NULL::text AS creative_raw_record_id,
        NULL::text[] AS source_tables
      WHERE false
    $view$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('airbyte_google_search_console.search_analytics_query_page') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.gsc_query_page_daily AS
      SELECT
        property,
        search_type,
        date_day,
        query,
        page,
        impressions,
        clicks,
        ctr,
        position,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          g.site_url AS property,
          g.search_type,
          g.date::date AS date_day,
          g.query,
          g.page,
          NULLIF(g.impressions::text, '')::numeric AS impressions,
          NULLIF(g.clicks::text, '')::numeric AS clicks,
          NULLIF(g.ctr::text, '')::numeric AS ctr,
          NULLIF(g.position::text, '')::numeric AS position,
          'airbyte_google_search_console.search_analytics_query_page'::text AS source_table,
          g._airbyte_generation_id::text AS source_generation_id,
          g._airbyte_extracted_at::timestamptz AS extracted_at,
          g._airbyte_raw_id::text AS raw_record_id,
          row_number() OVER (
            PARTITION BY g.site_url, g.search_type, g.date, g.query, g.page
            ORDER BY
              g._airbyte_extracted_at DESC NULLS LAST,
              g._airbyte_raw_id DESC NULLS LAST
          ) AS row_rank
        FROM airbyte_google_search_console.search_analytics_query_page AS g
      ) AS ranked
      WHERE row_rank = 1
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.gsc_query_page_daily AS
      SELECT
        NULL::text AS property,
        NULL::text AS search_type,
        NULL::date AS date_day,
        NULL::text AS query,
        NULL::text AS page,
        NULL::numeric AS impressions,
        NULL::numeric AS clicks,
        NULL::numeric AS ctr,
        NULL::numeric AS position,
        NULL::text AS source_table,
        NULL::text AS source_generation_id,
        NULL::timestamptz AS extracted_at,
        NULL::text AS raw_record_id
      WHERE false
    $view$;
  END IF;
END $$;
`;
