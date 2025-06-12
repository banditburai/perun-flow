# Task Structure Documentation

## Task File Format

Tasks are stored as markdown files in status-based directories:
- `.tasks/pending/` - Tasks not yet started
- `.tasks/in-progress/` - Tasks currently being worked on  
- `.tasks/done/` - Completed tasks
- `.tasks/archive/` - Archived tasks

### File Naming Convention

`{STREAM}-{PHASE}.{SEQ}-{TIMESTAMP}-{ID}-{KEBAB-TITLE}.md`

Example: `API-1.01-mbsa5z3p-22c48d-build-authentication-module.md`

### Task Markdown Structure

```markdown
# {Task Title}

**ID:** {unique-id}  
**Created:** {ISO timestamp}  
**Updated:** {ISO timestamp}  
**Status:** {pending|in-progress|done|archive}  
**Priority:** {high|medium|low}  
**Stream:** {detected stream}  
**Phase:** {phase number}  

## Description
{Task description}

## Dependencies
- [{dependency-id}](../{status}/{dependency-filename})
- ...

## Dependents
- [{dependent-id}](../{status}/{dependent-filename})
- ...

## Tasks
- [ ] Subtask 1
- [x] Completed subtask
- ...

## Notes
### {ISO timestamp}
{Note content}
```

## Stream Detection

Tasks are automatically assigned to streams based on keywords:

- **API**: REST, GraphQL, endpoint, route
- **UI**: component, frontend, React, Vue, interface
- **DB**: database, schema, migration, query
- **TEST**: test, spec, unit, integration
- **DOC**: documentation, readme, guide
- **DEPLOY**: deployment, version control, release
- **CONFIG**: configuration, setup, environment
- **FIX**: bug, fix, issue, error
- **FEAT**: feature, enhancement, improve
- **TASK**: General tasks (default)

## Task Relationships

### Dependencies
- Tasks can depend on other tasks
- Dependencies must be completed before a task can be marked as done
- Circular dependencies are detected and prevented

### Dependents
- Reverse relationships are automatically tracked
- Shows which tasks would be blocked if this task is not completed
- Clickable markdown links for easy navigation

## ID Generation

Task IDs follow the pattern: `{STREAM}-{PHASE}.{SEQ}`
- Stream: Detected from title/description
- Phase: Major version (1, 2, 3...)
- Sequence: Minor version within phase (01, 02, 03...)

Example progression:
- API-1.01: First API task
- API-1.02: Second API task in phase 1
- API-2.01: First API task in phase 2