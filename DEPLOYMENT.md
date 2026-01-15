# Deployment Guide

## Recommended: Vercel (Free & Easy)

This Next.js app requires server-side API routes, so **Vercel is the recommended hosting solution** (it's free and made by the Next.js team).

### Quick Deploy to Vercel:

1. Go to [vercel.com](https://vercel.com) and sign up/login with GitHub
2. Click "New Project"
3. Import your repository: `anikayadav101/listening-activity-map`
4. Vercel will auto-detect Next.js settings
5. Add environment variable:
   - Name: `LASTFM_API_KEY`
   - Value: Your Last.fm API key (get it from https://www.last.fm/api/account/create)
6. Click "Deploy"
7. Your site will be live at `https://your-project.vercel.app`

That's it! Vercel will automatically deploy on every push to GitHub.

## Alternative: GitHub Pages (Not Recommended)

GitHub Pages only serves static files and **cannot run Next.js API routes**. Your app uses API routes for:
- Last.fm authentication
- Fetching listening data
- Location lookups

These won't work on GitHub Pages. If you still want to try:
1. Enable GitHub Pages in your repository settings
2. The static export will build, but API functionality will be broken
3. You'd need to refactor to remove all API routes and make direct client-side calls (which won't work due to CORS and API key security)

**Recommendation: Use Vercel for the best experience.**

## Custom Domain Setup

To use a custom domain with GitHub Pages:

### Step 1: Configure Domain in GitHub
1. Go to your repository: https://github.com/anikayadav101/listening-activity-map
2. Click **Settings** → **Pages**
3. Under **Custom domain**, enter your domain (e.g., `listeningmap.com` or `www.listeningmap.com`)
4. Check **Enforce HTTPS** (recommended)
5. Click **Save**

GitHub will automatically create a `CNAME` file in your repository.

### Step 2: Configure DNS Records

You need to add DNS records at your domain registrar (where you bought the domain):

#### Option A: Apex Domain (e.g., `listeningmap.com`)
Add these A records pointing to GitHub Pages IPs:
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

#### Option B: Subdomain (e.g., `www.listeningmap.com`)
Add a CNAME record:
```
Type: CNAME
Name: www (or @)
Value: anikayadav101.github.io
```

### Step 3: Wait for DNS Propagation
- DNS changes can take 24-48 hours to propagate
- You can check propagation status at: https://www.whatsmydns.net/

### Step 4: Verify
Once DNS propagates, your site will be accessible at your custom domain!

**Note:** If you use a custom domain, you may need to update the `basePath` in `next.config.js` to remove the `/listening-activity-map` prefix.

