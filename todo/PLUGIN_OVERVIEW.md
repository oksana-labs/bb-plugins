## Task cards

A personal list grouped by project and priority. Expand a task to edit its
description, open links, add dated comments and attach files up to 5 MiB.
Comments can be edited or removed. Files are stored in the plugin database
and downloaded through the browser.

## Agent tools

Use `todo_add` and `todo_list` for tasks, `todo_details` to read a card,
`todo_comment` to add a comment and `todo_attach` to attach base64 file data.
The existing `bb todo` commands remain available.

## Storage

Existing tasks are preserved through additive SQLite migrations. Deleting a
task deletes its comments and attachments. No external service is required.
