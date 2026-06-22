---
name: Replit production database (Helium vs Neon)
description: How Replit dev/prod databases work and why deployed apps fail with "getaddrinfo EAI_AGAIN helium"
---

# Replit production database behavior

Replit has TWO separate databases per app:
- **Development** (since 2025-12-04): runs on Replit's own infra, hostname `helium`. `DATABASE_URL` points to `...@helium/...`. `helium` ONLY resolves inside the dev container.
- **Production**: a SEPARATE database on Neon, created during the Publishing flow.

## Failure mode
A deployed app crashing with `getaddrinfo EAI_AGAIN helium` means the production deployment is using the dev `DATABASE_URL` (helium), because no production database was ever created. `helium` is unresolvable outside the dev container.

`executeSql({environment:"production"})` returning "does not have a production Neon database. Deploy your app first to create a production database." confirms no prod DB exists.

## The fix (NO external account needed)
This is a Replit Publishing UI operation the USER must perform — the agent cannot toggle it:
1. Project Editor → Publish / Republish
2. Open **Production database settings**
3. Turn ON **Create production database**
4. Turn ON **Set up your production database with your current development data** (copies dev data)
5. Complete publish.

Publishing automatically sets the deployed app's `DATABASE_URL` to the new production DB — no manual secret edit needed.

**Why:** For Helium apps, production DBs are created automatically during publishing, but only when the toggle is enabled. A manually-set `DATABASE_URL` secret can conflict/shadow this.

## Driver note
Both `@neondatabase/serverless` and `pg` (drizzle-orm/node-postgres) work against Helium dev AND the Neon production DB (standard TCP connection string). The driver is NOT the cause of helium DNS failures — the hostname is. Do not waste time swapping drivers to fix EAI_AGAIN.

## What does NOT help
- Running `create_postgresql_database_tool` again — just re-sets dev secrets to helium.
- Switching deployment target cloudrun→vm.
- Swapping db driver.
