---
name: ops-runbook-workflow
description: Design a one-off operational task that touches a deployed database — password resets, extending invitations, backfills, data repair — as a guarded GitHub Actions workflow instead of someone running a script by hand. Use when asked to build an ops tool, a maintenance job, an admin script, or a way to fix production data safely.
---

# Operational tasks as guarded workflows

This repository ships no deployment pipeline — infrastructure lives elsewhere.
What follows is the shape to reach for when one is needed, because the pattern
is what took the iterations, not the YAML.

## The problem

Sooner or later something has to be done to a deployed database that the
product has no screen for: reset a locked-out user's password, extend an
invitation that expired over a weekend, backfill a column, repair a bad row.

Two obvious answers are both bad. An admin endpoint in the app is permanent
attack surface for something used twice a year. An engineer with a database
client is unlogged, unreviewed, and one `WHERE` clause away from an incident.

## The shape

A `workflow_dispatch` GitHub Actions workflow that runs a one-off container
task inside the VPC.

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, production]
        required: true
      email:
        description: Target user
        required: true
      confirm:
        description: Type the environment name in CAPITALS to proceed
        required: true
```

It earns its place on five counts:

1. **Not reachable from the internet.** No route, no endpoint, nothing to scan for.
2. **Logged by default.** Actions records who ran it, when, and with what inputs — an audit trail nobody has to remember to write.
3. **Authorization is the repository's.** Who may run it is who may push to it. There is no second permission system.
4. **Credentials are short-lived.** Assume a role via OIDC; no long-lived keys anywhere.
5. **It reaches private subnets.** Aurora should not be publicly accessible, so a laptop cannot reach it — but a Fargate task in the VPC can.

## The confirmation guard

The single most valuable line. Require the operator to retype the environment
name, and fail before anything runs if it does not match:

```yaml
- name: Confirm target
  run: |
    if [ "${{ inputs.confirm }}" != "$(echo '${{ inputs.environment }}' | tr '[:lower:]' '[:upper:]')" ]; then
      echo "::error::confirm must be '$(echo '${{ inputs.environment }}' | tr '[:lower:]' '[:upper:]')'"
      exit 1
    fi
```

A dropdown defaulting to the first option is one stray click from production.
Typing `PRODUCTION` is not something anyone does by accident.

## Reaching the database

Run the existing migration image as a one-off task, overriding the command:

```yaml
- run: |
    aws ecs run-task \
      --cluster "$CLUSTER" \
      --task-definition "$MIGRATION_TASK_DEF" \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
      --overrides '{"containerOverrides":[{"name":"migration","command":["pnpm","tsx","scripts/<task>.ts"]}]}'
```

Reusing the migration task definition rather than defining a new one keeps the
image, role and network configuration in one place.

Note that `aws ecs run-task` returns as soon as the task is *scheduled*. Poll
`describe-tasks` for the exit code and pull the CloudWatch log stream, or a
failed task reports as a green workflow.

## Writing the script itself

Put it in `scripts/`, and give it the same guards:

- take the target as an argument; never hard-code an id or an email
- print what it is about to do, and what it found, before changing anything
- make it idempotent — operational tasks get run twice
- write an audit row, exactly as the application would
- fail loudly on an unexpected row count; `UPDATE` matching 400 rows when one was meant is the incident

Load the environment through a bootstrap, as `db/seed-env.ts` does — imports
are evaluated before the module body, so a script that calls dotenv itself has
already built its database client against an empty `DATABASE_URL`.

## Scheduled jobs are a different thing

For recurring work, expose `app/api/cron/<name>/route.ts` and authenticate it
with the `X-Cron-Secret` header. `proxy.ts` already exempts `/api/cron/` from
the session check, since a scheduler has no session.

A GitHub Actions `schedule:` trigger is the cheapest way to call it, but its
cron drifts and can skip runs entirely under load. That is acceptable for a
daily digest and not for anything with a deadline — use EventBridge when the
timing actually matters.
