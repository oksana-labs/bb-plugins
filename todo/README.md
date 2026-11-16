# bb-plugin-todo

Personal todo list for BB: a sidebar page, agent tools `todo_add` /
`todo_list`, and `bb todo`. Tasks have a project (defaults to the calling
thread's BB project, else `Inbox`), a priority (`high`/`normal`/`low`),
notes, and the source thread.

```
bb plugin install .
bb todo add "Разобрать логи" --project Acme --priority high --notes "…"
bb todo list
```

See `skills/todo/SKILL.md` for the agent contract.

Click a task title to expand its card. Edit notes (4000 characters), follow
HTTP(S) links, add/edit/delete dated comments (10000 characters), and upload,
download or remove files up to 5 MiB each. File bytes live in the plugin's
SQLite database, independently of the original path. Downloads use the
browser's normal download flow; files are never executed or rendered inline.
Deleting a task also deletes its comments and attachments.

Additional agent tools: `todo_details({id})`, `todo_comment({todoId,text})`,
`todo_attach({todoId,name,data})` (`data` is base64). The list tool stays compact;
use details to read notes and comments. Attachment metadata excludes file bytes.

Local development: `bb plugin types .`, `npm install`, `bb plugin build .`.
Back up tasks first with `bb todo list --all --json`. When switching from a
managed Git install, `bb plugin remove todo` is required before
`bb plugin install .`; BB retains the plugin database. Keep this checkout while
using a path install. Run `node verify.mjs` for migration/backend checks and
`npx tsx --tsconfig tsconfig.json verify-ui.tsx` for UI interaction checks.
