# Novix Fixed Node Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the `novix` release line enforce a fixed Novix node schema in the CLI, remove `spark add`, and update help/docs so the tool becomes a stable delivery artifact instead of a loosely guided generic tree writer.

**Architecture:** Centralize Novix schema validation in the storage/core layer so every read and write path uses the same enforcement. Then narrow CLI surface area and documentation to only the fixed Novix contract, with tests proving that free-form fields are rejected everywhere.

**Tech Stack:** TypeScript, Commander, Zod, Vitest

---

### Task 1: Add failing tests for the fixed node schema

**Files:**
- Modify: `tests/storage.spec.ts`
- Modify: `tests/core.spec.ts`
- Modify: `tests/cli-core.spec.ts`
- Modify: `tests/cli.spec.ts`

**Step 1: Write the failing test**

Add tests for:

- `init` producing a Novix-shaped root
- `add` rejecting extra fields such as `type`
- `update` rejecting `unset summary`
- `validate` rejecting a free-form node object
- `spark add` being unavailable or failing with a Novix-specific schema message

Example test shape:

```ts
await expect(
  addNode(filePath, {
    parent: 'root',
    set: {
      summary: 'ok',
      description: 'ok',
      references: ['https://example.com'],
      type: 'idea'
    }
  })
).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage.spec.ts tests/core.spec.ts tests/cli-core.spec.ts tests/cli.spec.ts`

Expected: failures showing the current implementation still accepts free-form fields or still exposes `spark add`.

**Step 3: Write minimal implementation**

Do not implement the whole feature yet. Only adjust tests until they fail for the intended reasons.

**Step 4: Run test to verify it still fails correctly**

Run: `npm test -- tests/storage.spec.ts tests/core.spec.ts tests/cli-core.spec.ts tests/cli.spec.ts`

Expected: red tests for Novix schema enforcement gaps, not syntax or setup issues.

**Step 5: Commit**

```bash
git add tests/storage.spec.ts tests/core.spec.ts tests/cli-core.spec.ts tests/cli.spec.ts
git commit -m "test: capture novix fixed-schema requirements"
```

### Task 2: Define Novix node types and schema validators

**Files:**
- Modify: `src/types.ts`
- Modify: `src/storage.ts`

**Step 1: Write the failing test**

Add focused tests in `tests/storage.spec.ts` for:

- root validity
- non-root requiring at least one reference
- rejecting extra business fields

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage.spec.ts`

Expected: failures because no Novix-specific validator exists yet.

**Step 3: Write minimal implementation**

Add explicit Novix business-field helpers and validators, for example:

```ts
const NOVIX_MUTABLE_FIELDS = new Set(['summary', 'description', 'references']);

function assertAllowedNovixFields(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    if (!NOVIX_MUTABLE_FIELDS.has(key)) {
      throw new CliError('SCHEMA_INVALID', `field '${key}' is not allowed in novix nodes`);
    }
  }
}
```

Add a validator for full node shape after structural parsing.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage.spec.ts`

Expected: new storage/schema tests pass.

**Step 5: Commit**

```bash
git add src/types.ts src/storage.ts tests/storage.spec.ts
git commit -m "feat: add novix node schema validation"
```

### Task 3: Make init produce a valid Novix root

**Files:**
- Modify: `src/storage.ts`
- Modify: `tests/core.spec.ts`
- Modify: `tests/cli-core.spec.ts`

**Step 1: Write the failing test**

Assert that `initTree` creates root with:

- `summary`
- `description`
- `references`

and that `validateTree` succeeds immediately after init.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/core.spec.ts tests/cli-core.spec.ts`

Expected: failures because root currently lacks Novix business fields.

**Step 3: Write minimal implementation**

Update `createInitialTree()` so root is created with stable placeholder values plus `references: []`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/core.spec.ts tests/cli-core.spec.ts`

Expected: root-shape assertions pass.

**Step 5: Commit**

```bash
git add src/storage.ts tests/core.spec.ts tests/cli-core.spec.ts
git commit -m "feat: initialize novix root schema"
```

### Task 4: Restrict add, update, upsert, and bulk to Novix fields

**Files:**
- Modify: `src/core.ts`
- Modify: `tests/core.spec.ts`
- Modify: `tests/cli-core.spec.ts`

**Step 1: Write the failing test**

Add tests for:

- `add` rejecting extra fields
- `upsert` rejecting extra fields
- `update` rejecting `unset summary/description/references`
- `bulk` rejecting unsupported fields in `set`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/core.spec.ts tests/cli-core.spec.ts`

Expected: failures because current mutation paths accept arbitrary keys.

**Step 3: Write minimal implementation**

Update mutation helpers in `src/core.ts` to:

- only allow `summary`, `description`, `references`
- require a complete valid node after creation/update
- reject destructive `unset` on required Novix fields
- reuse the same validator across `add`, `update`, `upsert`, and bulk operations

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/core.spec.ts tests/cli-core.spec.ts`

Expected: Novix write-path tests pass.

**Step 5: Commit**

```bash
git add src/core.ts tests/core.spec.ts tests/cli-core.spec.ts
git commit -m "feat: enforce novix schema on write paths"
```

### Task 5: Enforce Novix schema on read and validate paths

**Files:**
- Modify: `src/storage.ts`
- Modify: `src/core.ts`
- Modify: `tests/storage.spec.ts`
- Modify: `tests/core.spec.ts`

**Step 1: Write the failing test**

Add a fixture or inline JSON object representing a free-form drifted node, then assert:

- `readTree()` rejects it
- `validateTree()` reports invalidity

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage.spec.ts tests/core.spec.ts`

Expected: failures because free-form trees are still read successfully today.

**Step 3: Write minimal implementation**

After structural parsing, validate every node against the Novix schema and throw `SCHEMA_INVALID` with actionable field-level messages.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage.spec.ts tests/core.spec.ts`

Expected: invalid free-form trees are rejected.

**Step 5: Commit**

```bash
git add src/storage.ts src/core.ts tests/storage.spec.ts tests/core.spec.ts
git commit -m "feat: reject non-novix tree files"
```

### Task 6: Remove or disable spark add and improve CLI help

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.spec.ts`
- Modify: `tests/cli-core.spec.ts`

**Step 1: Write the failing test**

Add tests for:

- top-level `--help` mentioning fixed Novix schema
- `add --help` mentioning allowed fields
- `validate --help` mentioning root/non-root reference rules
- `spark add` absent from help or returning a controlled error

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli.spec.ts tests/cli-core.spec.ts`

Expected: failures because current help is generic and `spark add` still exists.

**Step 3: Write minimal implementation**

Use Commander `.description()`, `.summary()`, `.option()` help text, and optional `.addHelpText()` examples. Remove the `spark add` command registration or replace it with an explicit Novix-line rejection.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli.spec.ts tests/cli-core.spec.ts`

Expected: help output and spark behavior match the Novix contract.

**Step 5: Commit**

```bash
git add src/cli.ts tests/cli.spec.ts tests/cli-core.spec.ts
git commit -m "feat: narrow novix cli surface and help text"
```

### Task 7: Simplify Novix-facing documentation and skill guidance

**Files:**
- Modify: `README.md`
- Modify: `novix-idea-spark-skill.md`

**Step 1: Write the failing test**

This task is doc-only. No automated failing test is required. Instead, define the expected doc deltas before editing:

- README describes fixed Novix schema and help examples
- skill no longer depends on external schema validation
- skill focuses on research gating, not field policing

**Step 2: Verify current docs are outdated**

Run: `rg -n "python3|summary|description|references|spark add|fixed node schema" README.md novix-idea-spark-skill.md`

Expected: current docs still describe the old softer contract.

**Step 3: Write minimal implementation**

Update docs to match the enforced Novix contract and remove obsolete validation guidance.

**Step 4: Review docs for consistency**

Run: `sed -n '1,260p' README.md`

Run: `sed -n '1,260p' novix-idea-spark-skill.md`

Expected: docs describe the same schema and command surface as the CLI.

**Step 5: Commit**

```bash
git add README.md novix-idea-spark-skill.md
git commit -m "docs: align novix docs with fixed schema"
```

### Task 8: Run full verification and prepare the Novix release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Verify version target**

Confirm the Novix release version to publish next, keeping the `novix` dist-tag workflow.

**Step 2: Run full verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript build passes.

**Step 3: Bump prerelease version if needed**

Example:

```bash
npm version 0.3.0-novix.1 --no-git-tag-version
```

**Step 4: Publish the Novix line**

```bash
npm publish --access public --tag novix
```

Expected: package publishes successfully without changing the `latest` track.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: cut next novix prerelease"
```
