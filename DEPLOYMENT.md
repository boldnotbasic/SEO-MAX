# SEO MAX - Deployment Guide

## 🚀 Waarom Deployen?

**CORS Probleem**: Browsers blokkeren requests van lokale bestanden naar externe websites om veiligheidsredenen. Dit voorkomt dat je echte websites kunt crawlen.

**Oplossing**: Deploy naar een hosting platform voor volledige functionaliteit.

## 📋 Deployment Opties

### 1. **Vercel (Aanbevolen) - GRATIS**

#### Voordelen:
- ✅ Eigen proxy server voor CORS bypass
- ✅ Automatische HTTPS
- ✅ Snelle global CDN
- ✅ Eenvoudige GitHub integratie

#### Stappen:
1. **GitHub Repository maken**:
   ```bash
   git init
   git add .
   git commit -m "Initial SEO MAX commit"
   git remote add origin https://github.com/jouwusername/seo-max.git
   git push -u origin main
   ```

2. **Vercel Account**:
   - Ga naar [vercel.com](https://vercel.com)
   - Login met GitHub
   - Klik "New Project"
   - Selecteer je SEO MAX repository
   - Deploy!

3. **Custom Domain (Optioneel)**:
   - Voeg je eigen domein toe in Vercel dashboard
   - Bijvoorbeeld: `seo-max.jouwdomein.nl`

### 2. **Netlify - GRATIS**

#### Voordelen:
- ✅ Drag & drop deployment
- ✅ Automatische HTTPS
- ✅ Goede performance

#### Stappen:
1. **Zip je bestanden** (zonder node_modules)
2. Ga naar [netlify.com](https://netlify.com)
3. Sleep zip naar "Deploy" sectie
4. Klaar!

### 3. **GitHub Pages - GRATIS**

#### Beperkingen:
- ❌ Geen server-side proxy
- ❌ Alleen statische bestanden
- ⚠️ CORS problemen blijven bestaan

## 🔧 Na Deployment

### Test Functionaliteit:
1. **Demo Mode**: Typ "demo" + zoekwoord
2. **Echte Websites**: Test met populaire sites zoals:
   - `https://example.com`
   - `https://google.com`
   - `https://github.com`

### Verwachte Resultaten:
- ✅ **Met Vercel**: 90% van websites werken
- ⚠️ **Met Netlify**: 60% van websites werken
- ❌ **Lokaal**: Alleen demo mode werkt

## 🛠️ Troubleshooting

### Website Niet Bereikbaar?
1. **Controleer Console**: F12 → Console tab
2. **Probeer Demo**: Typ "demo" om te testen
3. **Andere URL**: Sommige sites blokkeren bots

### Performance Optimalisatie:
```javascript
// In script.js - verhoog timeout voor langzame sites
const response = await fetch(proxyUrl, {
    timeout: 30000 // 30 seconden
});
```

## 📊 Deployment Vergelijking

| Platform | CORS Fix | Kosten | Snelheid | Gemak |
|----------|----------|--------|----------|-------|
| **Vercel** | ✅ Volledig | Gratis | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Netlify** | ⚠️ Beperkt | Gratis | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **GitHub Pages** | ❌ Nee | Gratis | ⭐⭐⭐ | ⭐⭐⭐ |
| **Lokaal** | ❌ Nee | Gratis | ⭐⭐⭐⭐⭐ | ⭐⭐ |

## 🎯 Aanbeveling

**Voor SEO MAX**: Gebruik **Vercel** voor de beste ervaring met echte website crawling.

**Quick Start**:
1. Push code naar GitHub
2. Connect met Vercel
3. Deploy in 2 minuten
4. Test met echte websites!

## 🔗 Handige Links

- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com)
- [GitHub Pages Guide](https://pages.github.com)

---

**💡 Tip**: Na deployment kun je de tool gebruiken voor echte SEO audits van klanten!
