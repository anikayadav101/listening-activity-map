# Custom Domain Setup for GitHub Pages

## Quick Setup Guide

### 1. Get a Domain
If you don't have a domain yet, you can buy one from:
- [Namecheap](https://www.namecheap.com/)
- [Google Domains](https://domains.google/)
- [Cloudflare](https://www.cloudflare.com/products/registrar/)
- Any other domain registrar

### 2. Configure in GitHub
1. Go to: https://github.com/anikayadav101/listening-activity-map/settings/pages
2. Under **Custom domain**, enter your domain (e.g., `listeningmap.com`)
3. Check **Enforce HTTPS**
4. Click **Save**

GitHub will automatically:
- Create a `CNAME` file in your repository
- Set up SSL certificate (may take a few minutes)

### 3. Configure DNS at Your Registrar

#### For Apex Domain (e.g., `listeningmap.com`):
Add 4 A records:
```
Type: A
Name: @ (or leave blank)
Value: 185.199.108.153
TTL: 3600 (or default)

Type: A
Name: @
Value: 185.199.109.153

Type: A
Name: @
Value: 185.199.110.153

Type: A
Name: @
Value: 185.199.111.153
```

#### For Subdomain (e.g., `www.listeningmap.com`):
Add 1 CNAME record:
```
Type: CNAME
Name: www
Value: anikayadav101.github.io
TTL: 3600 (or default)
```

### 4. Update Next.js Config (if using apex domain)

If you use an apex domain (no `/listening-activity-map` path), update `next.config.js`:

```javascript
basePath: '',  // Remove the path
assetPrefix: '',  // Remove the path
```

Then rebuild and push:
```bash
npm run build
git add . && git commit -m "Update for custom domain" && git push
```

### 5. Wait and Verify
- DNS changes take 24-48 hours (usually faster, sometimes minutes)
- Check status: https://www.whatsmydns.net/
- Once propagated, visit your custom domain!

## Troubleshooting

**Domain not working?**
- Wait 24-48 hours for DNS propagation
- Check DNS records are correct
- Verify CNAME file exists in repository
- Check GitHub Pages settings show "Your site is live at..."

**HTTPS not working?**
- Wait a few minutes after adding domain (GitHub needs to provision SSL)
- Make sure "Enforce HTTPS" is checked in GitHub settings

**Still using GitHub Pages URL?**
- Clear browser cache
- Check DNS propagation status
- Verify CNAME file is in the repository

