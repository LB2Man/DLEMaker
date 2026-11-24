# DLEMaker

A React and TypeScript character-guessing game builder, backed by Express and PostgreSQL.

Live website: https://dlemaker.web.app. The frontend runs on Firebase Hosting, the API on Render, and the online PostgreSQL database on Neon.

## Run the website

The project uses Node.js 22.18+ and a local PostgreSQL database named `dlemaker`.

Install packages from the project folder:

```powershell
npm.cmd install
npm.cmd --prefix server install
```

Create `server/.env` with your own PostgreSQL connection details:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=dlemaker
PGUSER=postgres
PGPASSWORD=your_password
```

The backend creates its table and adds missing metadata columns on startup. Your existing DLEs remain in the database.

Build and run the complete website:

```powershell
npm.cmd run build
npm.cmd start
```

Open http://localhost:3001.

For development, run `npm.cmd run server` and `npm.cmd run dev` in separate terminals. Open Vite's printed address, usually http://localhost:5173. Vite forwards /api requests to Express.

## Create, edit, and play

- The frontend uses Firebase Authentication for Google sign-in. Configure Google and authorize localhost in the Firebase console.
- Add a DLE name, optional description, category headings, and character values.
- Category fields suggest distinct values already used in that same column, filtered as you type. Choose with the mouse or arrow keys and Enter; Escape dismisses suggestions. You can always type a new value. The character-name column does not suggest existing names.
- Choose which column identifies characters. Its position is your choice.
- Drag the grip beside “Category” to reorder columns. Character values and the selected character-name column move together. Keyboard users can focus the grip and press the left or right arrow key.
- The moon/sun switch changes the theme across all pages. It remembers your choice, synchronizes open tabs, and follows your device theme until you choose one.
- Publish saves the game in PostgreSQL and makes it appear on Explore.
- Edit opens the same saved record. Saving changes updates that record.
- All signed-in creators can edit all games. The backend verifies Firebase ID tokens before loading the editor data, creating DLEs, or saving changes.
- New DLEs record their creator from the verified Google login. Editing preserves the original creator. Older DLEs with no stored author show “Creator not recorded”; the website does not guess their author.
- Desktop editor columns fit the available width, with sticky category headings. On smaller screens, character fields stack with their category labels so no sideways scrolling is needed.
- Explore shows a recently loaded list immediately on return visits and refreshes it in the background. Public reads avoid unnecessary login headers and requests. The first request after the free Render service sleeps can still take longer.
- Entirely empty character rows are omitted when publishing. Complete at least two distinct characters and two named columns.
- New unsaved DLE drafts are kept in the current browser.
- Play selects a random secret character on the server. Green clues match, yellow clues share a comma-separated value, and red clues differ.
- Numeric values with matching units get higher/lower hints.
- In-progress rounds survive page refreshes in the same tab. They expire after 24 hours or a backend restart. Saved DLEs persist in PostgreSQL.
- Share result copies a spoiler-free clue grid and the game address.

## Source

- `src/App.tsx` — navigation and Explore.
- `src/Editor.tsx` — the DLE editor and publishing.
- `src/Play.tsx` — guessing, feedback, and result sharing.
- `src/api.ts` — shared TypeScript types and requests.
- `src/index.css` — responsive visual design.
- `server/index.ts` — validation, database queries, and game routes.
- `server/auth.ts` — Firebase ID token verification.

## Checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd --prefix server run typecheck
```

## Public deployment

Firebase Hosting serves the frontend at https://dlemaker.web.app. Render runs Express, and Neon hosts PostgreSQL. The deployment configuration is prepared in `firebase.json`, `.firebaserc`, and `render.yaml`.

1. Create a Neon PostgreSQL database and obtain its connection URL privately.
2. Deploy `render.yaml` from the GitHub repository as a Render Blueprint, or create a Node Web Service with root directory `server`, build command `npm ci --include=dev`, and start command `npm start`.
3. Set Render environment variables `DATABASE_URL` to the Neon URL, `FIREBASE_PROJECT_ID` to `dlemaker`, and `NODE_VERSION` to `22.18.0`. The Firebase domains are already allowed by the backend. The service reads Render's `PORT` automatically.
4. Verify the service's `/api/health` endpoint. New published DLEs will save to Neon. Copying existing local DLEs is a separate, optional migration.
5. Create a private, ignored `.env.production.local` in the project root with `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com`, using the actual Render address without a trailing `/api`.
6. Run `firebase.cmd deploy --only hosting --project dlemaker`. The configured predeploy command builds React first.
7. Test Google sign-in, saving, shared editing, and playing at https://dlemaker.web.app.

The server reads `DATABASE_URL` when supplied and otherwise uses the existing local `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` settings. Firebase verification uses the project ID and Google's public signing certificates. This verification flow needs no downloaded service-account key.

The public website is deployed at https://dlemaker.web.app and its API at https://dlemaker.onrender.com. The local website remains available at http://localhost:3001.
