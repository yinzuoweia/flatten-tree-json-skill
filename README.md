# NIS (`@yinzuoweia/nis`)

Agent-friendly JSON tree CLI and JS API.

## Install

```bash
npm i @yinzuoweia/nis
```

Run without installing:

```bash
npx @yinzuoweia/nis --version
```

> `npx nis` resolves to an unrelated unscoped package on npm. Use `npx @yinzuoweia/nis ...` instead.

## CLI

Default file path: `./.nis/tree.json`

```bash
nis init [--file <path>] [--force]
nis add --set key=value... [--parent <id>] [--id <id>] [--file <path>]
nis get <id> [--file <path>]
nis ls [parentId] [--max <n>] [--file <path>]
nis update <id> [--set key=value...] [--unset key...] [--file <path>]
nis delete <id> [--cascade|--no-cascade] [--yes] [--file <path>]
nis move <id> --to <newParentId> [--file <path>]
nis find "<query>" [--max <n>] [--sort <field:asc|desc>] [--fields <csv>] [--file <path>]
nis validate [--file <path>]
nis upsert --id <id> --set key=value... [--parent <id>] [--file <path>]
nis bulk --ops-file <json> [--atomic|--no-atomic] [--file <path>]
nis snapshot create [--name <name>] [--file <path>]
nis snapshot restore <snapshotId> [--file <path>]
```

### Natural aliases (`spark`)

```bash
nis spark search "newer_than:7d tag:idea" --max 10
nis spark add "summary:idea description:detail" under root
nis spark delete <id> --yes
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
} from '@yinzuoweia/nis';
```

## Output Contract

CLI always writes machine-readable JSON:

- success: `{"ok": true, "action": "...", "file": "...", "result": ..., "warnings": []}`
- error: `{"ok": false, "action": "...", "error": {"code": "...", "message": "...", "hint": "..."}}`

## Notes

- Root node is fixed as `root` and immutable.
- Reserved fields: `id,parent,children,created_at`.
- Writes are protected by file lock + atomic rename.
- Snapshot retention default is `20` and can be configured with `NIS_SNAPSHOT_KEEP`.
