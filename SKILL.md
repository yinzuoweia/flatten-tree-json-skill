---
name: nis-tree-cli
description: Use when an agent needs to create, edit, search, or validate tree-structured JSON via the nis CLI in bash, with safe delete preview, atomic bulk updates, snapshots, and structured error handling.
---

# NIS Tree CLI

## Overview

`nis` is a machine-friendly CLI for tree JSON operations.
It always returns JSON envelopes, so agents should parse response `ok/action/result/error` instead of guessing from plain text.

## Install (if CLI is missing)

If `nis --version` fails, install using one of these methods:

```bash
# Global install (preferred)
npm i -g @yinzuoweia/nis

# Or run without global install
npx @yinzuoweia/nis --version
```

Do **not** use `npx nis ...`:

- `nis` (unscoped) is a different npm package and does not expose the expected CLI binary.
- Always use scoped package execution: `npx @yinzuoweia/nis <command>`.

## When to Use

Use this skill when you need to:
- Initialize a tree file (`.nis/tree.json` or custom path)
- Add/update/delete/move/search nodes in bash
- Run deterministic natural aliases (`nis spark ...`)
- Execute multi-step atomic changes with rollback (`bulk --atomic`)
- Create or restore snapshots for safe recovery

Do not use this skill if the task is in-memory only and no file persistence is needed.

## Preflight

```bash
nis --version
```

If the command is unavailable, install/build first, then retry.

Always set a file path explicitly in agent workflows:

```bash
TREE_FILE="/abs/path/to/.nis/tree.json"
```

## Canonical Commands

```bash
nis init --file "$TREE_FILE" [--force]
nis add --file "$TREE_FILE" --parent root --set summary=Idea --set tag=idea
nis get <id> --file "$TREE_FILE"
nis ls [parentId] --file "$TREE_FILE" --max 20
nis update <id> --file "$TREE_FILE" --set score=0.9 --unset temp_field
nis delete <id> --file "$TREE_FILE"            # preview only
nis delete <id> --file "$TREE_FILE" --yes      # execute cascade delete
nis move <id> --to <newParentId> --file "$TREE_FILE"
nis find "newer_than:7d tag:idea" --file "$TREE_FILE" --max 10 --sort created_at:desc
nis validate --file "$TREE_FILE"
nis upsert --id node_a --parent root --set summary=Updated --file "$TREE_FILE"
nis bulk --ops-file /abs/path/ops.json --file "$TREE_FILE" --atomic
nis snapshot create --file "$TREE_FILE" --name before_bulk
nis snapshot restore <snapshotId> --file "$TREE_FILE"
```

## Natural Alias Layer (`spark`)

Use alias only when natural syntax helps readability; canonical commands remain preferred for strict automation.

```bash
nis spark search "newer_than:7d tag:idea" --file "$TREE_FILE" --max 10
nis spark add "summary:NewIdea tag:idea" under root --file "$TREE_FILE"
nis spark delete <id> --file "$TREE_FILE" --yes
```

## Safe Mutation Pattern (Agent Default)

1. Validate file before major edits:
```bash
nis validate --file "$TREE_FILE"
```
2. For deletions, always preview first:
```bash
nis delete <id> --file "$TREE_FILE"
```
3. Execute only after preview is confirmed:
```bash
nis delete <id> --file "$TREE_FILE" --yes
```
4. For multi-op changes, use atomic bulk + snapshot:
```bash
nis snapshot create --file "$TREE_FILE" --name pre_bulk
nis bulk --ops-file /abs/path/ops.json --file "$TREE_FILE" --atomic
```

## Query DSL Quick Reference

- Full text term: `transformer`
- Field filter: `tag:idea`, `parent:root`
- Comparator: `score>=0.8`, `created_at>1710000000`
- Relative time: `newer_than:7d`, `older_than:30d`
- Multiple tokens are AND by default

## Response and Error Handling

Success envelope:
```json
{"ok":true,"action":"find","file":"...","result":[],"warnings":[]}
```

Error envelope:
```json
{"ok":false,"action":"delete","error":{"code":"NODE_NOT_FOUND","message":"...","hint":"..."}}
```

Common error codes and next actions:
- `FILE_NOT_FOUND`: run `nis init --file ...`
- `SCHEMA_INVALID`: run `nis validate --file ...`, repair malformed file
- `NODE_NOT_FOUND`: run `nis find "id:<node>" --file ...`
- `NODE_ID_CONFLICT`: choose a different `--id` or use `upsert`
- `ROOT_IMMUTABLE`: do not modify/delete `root`
- `DELETE_CONFIRM_REQUIRED`: re-run delete with `--yes`
- `CYCLE_DETECTED`: choose another parent for move
- `LOCK_TIMEOUT`: retry after backoff; avoid concurrent writers

## Bulk Ops File Shape

`ops.json` can be array form:

```json
[
  { "action": "add", "parent": "root", "set": { "summary": "A" } },
  { "action": "update", "id": "node_a", "set": { "score": 0.9 } },
  { "action": "delete", "id": "node_b", "cascade": true, "yes": true }
]
```

For delete in bulk, include `"yes": true` explicitly.

## Agent Defaults

- Always pass `--file` to avoid cwd ambiguity.
- Prefer canonical commands for deterministic automation.
- Parse JSON result and branch on `ok/error.code`, not stderr text.
- Use `validate` before and after large operations.
- Use snapshot + atomic bulk for multi-step updates.
