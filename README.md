# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/a963a735-9f01-46fe-ab5b-bc78af62c5fb

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/a963a735-9f01-46fe-ab5b-bc78af62c5fb) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/a963a735-9f01-46fe-ab5b-bc78af62c5fb) and click on Share -> Publish.

### Netlify SPA Redirects (React Router)
- React SPA routes like `/auth` or `/dashboard` are handled client-side. On Netlify, direct hits to these routes return 404 unless all paths are rewritten to `index.html`.
- Add `public/_redirects` with:
  - `/* /index.html 200`
- Ensure `netlify.toml` contains:

```
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- After `npm run build`, Vite copies `public/_redirects` to `dist/_redirects`. Netlify reads this file to serve `index.html` for all routes, preventing 404s on client-side paths.

### Optional Fallback: HashRouter
- If you prefer not to use Netlify redirects, switch to Hash-based routing.
- Change in `src/App.tsx`:

```tsx
// import { BrowserRouter as Router } from "react-router-dom";
import { HashRouter as Router } from "react-router-dom";

// Then use <Router> instead of <BrowserRouter>
```

- URLs will look like: `https://mysite.netlify.app/#/auth` and won’t require `_redirects`.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
