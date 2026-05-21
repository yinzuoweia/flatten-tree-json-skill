# Novix Fixed Node Schema Design

## Goal

Turn the `novix` release line of `@yinzuoweia/tree-json-cli` into a stable delivery artifact for Novix idea trees by enforcing a fixed node schema in the CLI itself instead of relying on skill-level prompting and external validation.

## Problem

The current CLI enforces only structural tree validity:

- every node has `id`, `parent`, `children`, `created_at`
- arbitrary extra fields are allowed

That makes the Novix skill a soft contract. Even when the skill asks for `summary`, `description`, and `references`, agents can still produce trees like `current_tree.json` with drifting fields such as `type`, `content`, `tags`, `notes`, and scoring metadata. This reduces delivery stability and forces the skill to repeat schema rules that should be enforced by the tool.

## Decision Summary

For the `novix` release line:

- keep the same package name
- continue dual-track publishing with `latest` for the generic line and `novix` for the Novix-specific line
- make the Novix line enforce a fixed business schema for every node
- remove `spark add` from the Novix line because it encourages unconstrained field generation
- do not provide automatic migration for old free-form trees

## Release Model

Two release tracks remain under the same package name:

- `latest`: generic tree JSON CLI
- `novix`: fixed-schema Novix idea tree CLI

Publishing model:

- generic track: `npm publish --access public`
- Novix track: `npm publish --access public --tag novix`
- Novix versions continue as prereleases like `0.3.0-novix.x`

Installation model:

- generic users: `npm i @yinzuoweia/tree-json-cli`
- Novix users: `npm i @yinzuoweia/tree-json-cli@novix`

## Fixed Schema

Each node in the Novix line must have this shape:

```json
{
  "id": "string",
  "parent": "string|null",
  "children": ["string"],
  "created_at": 1234567890,
  "summary": "string",
  "description": "string",
  "references": ["https://example.com"]
}
```

Business-field rules:

- only `summary`, `description`, `references` are allowed beyond the structural fields
- `summary` must be a non-empty string after trim
- `description` must be a non-empty string after trim
- `references` must be an array of strings
- root may use `references: []`
- non-root nodes must contain at least one reference

Explicitly disallowed in the Novix line:

- arbitrary fields like `type`, `content`, `tags`, `notes`, `novelty`, `feasibility`
- deleting required business fields with `unset`

## Command Behavior

### Read and Validate

`readTree` and `validateTree` should enforce both:

- structural tree validity
- Novix node schema validity

Old free-form trees should fail validation with actionable `SCHEMA_INVALID` messages. There is no automatic migration path in this line.

### Init

`init` should create a root node that already satisfies the Novix schema, for example:

```json
{
  "id": "root",
  "parent": null,
  "children": [],
  "created_at": 1234567890,
  "summary": "",
  "description": "",
  "references": []
}
```

The schema should explicitly allow blank root `summary` and `description` immediately after init only if that is required for ergonomics. If not, `init` should create placeholder text. The simpler and more stable option is to create valid non-empty placeholders and document that users should update root content promptly.

Recommended direction:

- initialize root with stable placeholder strings so `init` produces a valid Novix tree immediately

### Add and Upsert

`add` and `upsert` should only accept these business fields:

- `summary`
- `description`
- `references`

Any extra field in `--set` should raise `SCHEMA_INVALID`.

New non-root nodes must be complete at creation time. No partial node creation.

### Update

`update` may change:

- `summary`
- `description`
- `references`

But after the update the node must still satisfy the full Novix schema. `unset summary`, `unset description`, and `unset references` should be rejected.

### Bulk

Bulk operations should go through the same validation path as interactive commands. The Novix line must not allow bulk to bypass field restrictions.

### Spark

Recommended behavior:

- keep `spark search`
- keep `spark delete`
- remove or explicitly disable `spark add`

Rationale:

- `spark add` invites free-form field generation, which conflicts with a fixed delivery schema
- `search` and `delete` do not weaken schema guarantees

## CLI Help

The Novix line should make the fixed-schema contract obvious in `--help`.

Top-level command description should state that this is a Novix idea-tree CLI with fixed node schema.

Help text should explicitly document:

- default file path behavior
- filename suffix requirement: `idea-tree.json`
- allowed business fields: `summary`, `description`, `references`
- root `references` may be empty
- non-root nodes require at least one reference
- `spark add` is unavailable in the Novix line

Examples should show canonical Novix usage, especially:

```bash
treejson add --file "$NOVIX_TREE_JSON_PATH" \
  --set summary="..." \
  --set description="..." \
  --set references='["https://example.com"]'
```

## Skill Simplification

After CLI enforcement is added, `novix-idea-spark-skill.md` can be simplified:

- remove repeated schema policing language
- remove external Python schema validation from the critical path
- keep the parts that tools cannot enforce:
  - research-before-expansion
  - novelty/gap/feasibility/reference gates
  - expansion depth and shortlist quality bar

## Testing Strategy

Add and update tests to cover:

- default root shape from `init`
- rejecting non-Novix fields on `add`, `update`, `upsert`, and `bulk`
- rejecting missing `references` on non-root nodes
- rejecting `unset` of required Novix fields
- `validate` failing on free-form trees like the current drifted shape
- CLI help showing Novix-specific descriptions
- `spark add` being absent or rejected

## Compatibility and Non-Goals

Non-goals for the Novix line:

- preserving generic extensibility
- automatically migrating old tree files
- supporting multiple business schemas in one binary

Those belong either to the `latest` line or to a future explicit migration tool, not to the Novix delivery path.
