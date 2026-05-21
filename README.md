# treejson (`@yinzuoweia/tree-json-cli`)

Novix idea-tree CLI and JS API for fixed-schema delivery.

## Install

```bash
npm i @yinzuoweia/tree-json-cli@novix
```

Run without installing:

```bash
npx @yinzuoweia/tree-json-cli@novix --version
```

> For deterministic CI/agent usage, prefer `npx @yinzuoweia/tree-json-cli ...`.

## CLI

This `novix` release line enforces a fixed node schema for every node:

```json
{
  "summary": "string",
  "description": "string",
  "references": ["https://example.com"]
}
```

Only `summary`, `description`, and `references` are allowed as business fields.
Missing fields default to empty values on `add` and `upsert`.

Default file path:
- If `/home/novix/workspace/project` exists: `/home/novix/workspace/project/novix-idea-tree.json`
- Otherwise: `./novix-idea-tree.json` (under current command working directory)

Custom `--file` path rule: file name must end with `idea-tree.json`.

```bash
treejson init [--file <path>] [--force]
treejson add --set key=value... [--parent <id>] [--id <id>] [--file <path>]
treejson get <id> [--file <path>]
treejson ls [parentId] [--max <n>] [--file <path>]
treejson update <id> [--set key=value...] [--unset key...] [--file <path>]
treejson delete <id> [--cascade|--no-cascade] [--yes] [--file <path>]
treejson move <id> --to <newParentId> [--file <path>]
treejson find "<query>" [--max <n>] [--sort <field:asc|desc>] [--fields <csv>] [--file <path>]
treejson validate [--file <path>]
treejson upsert --id <id> --set key=value... [--parent <id>] [--file <path>]
treejson bulk --ops-file <json> [--atomic|--no-atomic] [--file <path>]
treejson snapshot create [--name <name>] [--file <path>]
treejson snapshot restore <snapshotId> [--file <path>]
```

## Query DSL (v1)

- Full text term: `transformer`
- Field filter: `parent:root`
- Comparators: `created_at>1710000000`
- Relative time: `newer_than:7d`, `older_than:30d`
- Multiple conditions are AND.

## JS API

```ts
import {
  initTree,
  addNode,
  updateNode,
  deleteNode,
  moveNode,
  findNodes,
  validateTree,
  applyBulk,
  createSnapshot,
  restoreSnapshot,
} from '@yinzuoweia/tree-json-cli';
```

## Output Contract

CLI always writes machine-readable JSON:

- success: `{"ok": true, "action": "...", "file": "...", "result": ..., "warnings": []}`
- error: `{"ok": false, "action": "...", "error": {"code": "...", "message": "...", "hint": "..."}}`

## Notes

- Root node is fixed as `root` and immutable.
- Reserved fields: `id,parent,children,created_at`.
- Fixed business fields: `summary,description,references`.
- `validate` reports incomplete content as warnings, such as empty `summary`, empty `description`, or empty non-root `references`.
- Writes are protected by file lock + atomic rename.
- Snapshot retention default is `20` and can be configured with `TREEJSON_SNAPSHOT_KEEP`.
- Snapshots are stored under the tree file sibling directory: `.snapshot/`.
