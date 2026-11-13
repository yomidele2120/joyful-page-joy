# ITHUBAFRICA Deployment Guide

## Phase 1 status
This guide is intentionally scoped to safe deployment readiness for the current repo state.

## Pre-deployment checklist
- ensure Supabase migrations are applied in the correct order
- confirm provider environment variables are populated in the deployment environment
- validate admin access and role configuration
- confirm public pages and legal pages are ready for review
- test checkout, subscriptions and email flows with the correct keys

## Do not do
- do not deploy with fake credentials
- do not rely on frontend-only checks for payment or quota enforcement
- do not publish legal content without counsel review
