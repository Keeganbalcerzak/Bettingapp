# Notes for coding agents

- This is Next.js 16 with Cache Components and Partial Prefetching on. APIs differ from older versions, so read the bundled docs in `node_modules/next/dist/docs/` before changing routing, caching or data fetching.
- Pages are thin server components that render client components. Data comes from the route handlers in `src/app/api`, which keep their own in-memory cache (`src/lib/server/cache.ts`) so The Odds API is not hit on every request.
- Anything that reads the URL (`usePathname`, `useSearchParams`, dynamic `params`) must sit inside `<Suspense>`, or the build fails.
- The betting math lives in `src/lib/odds` and is pure and unit tested. Run `npm test`, `npm run lint` and `npm run typecheck` before pushing.
- Never call The Odds API from the client. The key stays server side and every call costs credits.
- Copy style: plain, short sentences, and no em dashes in UI text, docs or comments.
