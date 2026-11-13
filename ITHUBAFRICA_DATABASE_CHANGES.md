# ITHUBAFRICA Database Changes

## Phase 1 status
This phase focused on auditing rather than adding broad new production schema. The repo already contains a substantial migration history.

## Major migrations already present
- supplier memberships
- call quota / usage tables
- email notification outbox tables
- TikTok integration tables
- call logs and marketplace settings
- Cloudinary and image-mirroring support

## Recommended next database work
- AI usage and content approval tables
- advertising campaign tables and performance metrics
- social integration connection and token tracking
- risk review tables and administrative audit actions
- legal page CMS tables

## Important rule
Do not add duplicate tables when a near-equivalent system already exists. Extend the current schema in a migration-first workflow.
