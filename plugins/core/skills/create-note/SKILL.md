---
name: vault:create-note
description: Guided workflow for creating a new vault note. Use when the user says "add a note", "capture this", "create a note about X", or similar. Walks through type selection, title, tags, and content structure.
---

# Create Note — Guided Workflow

Walk the user through creating a well-structured vault note.

## Steps

1. **Determine the domain** — ask which area this belongs to:
   - Dev/Tech concept or tool → `note` in `10_Dev/`
   - Personal project → `project` in `20_Projects/`
   - Book, course, or video → `study` in `30_Studies/`
   - Raw idea or hypothesis → `idea` in `50_Ideas/`

2. **Get the title** — should be specific and searchable (e.g., "Docker Compose Cheat Sheet" not "Docker")

3. **Scaffold the file**:
   ```bash
   vault create "<title>" --type <type>
   ```

4. **Fill in required extras**:
   - `project`: ask for `status` and `goal`
   - `study`: ask for `medium` and `author`
   - `idea`: ask for `stage` (seedling/evergreen)

5. **Add tags** — minimum 2, all lowercase, no spaces

6. **Write the body** — use the template sections already in the file

7. **Validate**:
   ```bash
   vault validate --path content/<folder>
   ```

8. **Commit**:
   ```bash
   git add content/<folder>/<slug>.md
   git commit -m "note: add <title>"
   ```
