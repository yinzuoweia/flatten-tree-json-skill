# treejson (`@yinzuoweia/tree-json-cli`)

Agent-friendly JSON tree CLI and JS API.

## Install

```bash
npm i @yinzuoweia/tree-json-cli
```

Run without installing:

```bash
npx @yinzuoweia/tree-json-cli --version
```

> For deterministic CI/agent usage, prefer `npx @yinzuoweia/tree-json-cli ...`.

## CLI

Default file path: `./.treejson/tree.json`

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

### Natural aliases (`spark`)

```bash
treejson spark search "newer_than:7d tag:idea" --max 10
treejson spark add "summary:idea description:detail" under root
treejson spark delete <id> --yes
```

## Query DSL (v1)

- Full text term: `transformer`
- Field filter: `tag:idea`
- Comparators: `score>=0.9`, `created_at>1710000000`
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
- Writes are protected by file lock + atomic rename.
- Snapshot retention default is `20` and can be configured with `TREEJSON_SNAPSHOT_KEEP`.
