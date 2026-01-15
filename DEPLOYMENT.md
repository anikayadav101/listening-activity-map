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

