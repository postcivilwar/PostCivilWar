# postgres.js, as it was published

These files are the CommonJS build of [postgres.js](https://github.com/porsager/postgres), release **v3.4.7**
(commit `9b92b65da6a5121545581a6dd5de859c2a70177f`), copied unchanged from `cjs/src/` in that repository. It is
in the public domain (see `UNLICENSE`). It needs nothing but Node itself.

They are kept here, not installed, so that the site is deployed exactly as the repository has it: there is no
install step and no build step (see `vercel.json`). To move to a newer release, replace the ten `.js` files with
the ones from that release's `cjs/src/` and run `server/with-postgres.sh node --test server/test/*.test.mjs`.
