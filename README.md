# SEO Checker Tool

Een complete SEO analyse tool die websites controleert op belangrijke SEO factoren.

## Functionaliteiten

### ✅ Status & Indexering
- **Status Code**: Controleert of de website bereikbaar is (200 OK)
- **Noindex/Nofollow**: Detecteert robots meta tags die indexering blokkeren

### ✅ Title Tag Analyse
- **Aanwezigheid**: Controleert of er een title tag bestaat
- **Lengte**: Optimale lengte tussen 30-60 karakters
- **Zoekwoord**: Controleert of het opgegeven zoekwoord in de title voorkomt

### ✅ H1 Tag Analyse
- **Aantal**: Controleert dat er precies 1 H1 tag is
- **Inhoud**: Toont alle H1 tags op de pagina
- **Zoekwoord**: Controleert of het zoekwoord in H1 voorkomt

### ✅ Meta Description
- **Aanwezigheid**: Controleert of meta description bestaat
- **Lengte**: Optimale lengte tussen 120-160 karakters
- **Inhoud**: Toont de volledige meta description

### ✅ Afbeeldingen Alt-text
- **Coverage**: Percentage afbeeldingen met alt-text
- **Ontbrekende**: Aantal afbeeldingen zonder alt-text
- **Totaal**: Overzicht van alle afbeeldingen

### ✅ Canonical URL
- **Aanwezigheid**: Controleert of canonical tag bestaat
- **Validiteit**: Controleert of de canonical URL geldig is
- **Self-referencing**: Controleert of canonical naar zichzelf verwijst

### ✅ Links Analyse
- **Totaal**: Aantal gecontroleerde links (max 20 voor performance)
- **Interne/Externe**: Verdeling tussen interne en externe links
- **Broken Links**: Detecteert kapotte links

### ✅ URL Structuur
- **Lengte**: Controleert of URL kort genoeg is (<100 karakters)
- **Leesbaarheid**: Controleert op speciale karakters
- **Diepte**: Aantal niveaus in de URL structuur
- **Protocol**: HTTPS vs HTTP controle

## Gebruik

1. Open `index.html` in je webbrowser
2. Voer een URL in (bijvoorbeeld: https://example.com)
3. Voer optioneel een zoekwoord in voor keyword analyse
4. Klik op "Analyseren" om de SEO check te starten
5. Bekijk de resultaten in de verschillende categorieën

## Score Berekening

De SEO score wordt berekend op basis van 8 hoofdfactoren:
- Status Code (15 punten)
- Title Tag (15 punten)
- H1 Tags (10 punten)
- Meta Description (15 punten)
- Afbeeldingen Alt-text (10 punten)
- Canonical URL (10 punten)
- Broken Links (10 punten)
- URL Structuur (15 punten)

**Totaal: 100 punten**

### Score Categorieën:
- 🟢 **90-100%**: Uitstekend
- 🔵 **70-89%**: Goed
- 🟡 **50-69%**: Gemiddeld
- 🔴 **0-49%**: Slecht

## Technische Details

### CORS Handling
De tool gebruikt een proxy service (allorigins.win) om CORS beperkingen te omzeilen wanneer websites geen directe toegang toestaan.

### Beperkingen
- Links controle is beperkt tot 20 links voor performance
- Sommige websites blokkeren automatische analyse
- Externe links worden niet volledig gecontroleerd op broken status

### Browser Compatibiliteit
- Moderne browsers (Chrome, Firefox, Safari, Edge)
- JavaScript moet ingeschakeld zijn
- Internetverbinding vereist

## Bestanden

- `index.html` - Hoofdpagina met gebruikersinterface
- `styles.css` - Styling en responsive design
- `script.js` - SEO analyse logica en DOM manipulatie
- `README.md` - Deze documentatie

## Aanpassingen

De tool kan eenvoudig worden uitgebreid met:
- Meer SEO checks (schema markup, page speed, etc.)
- Batch analyse van meerdere URLs
- Export functionaliteit (PDF, CSV)
- Historische tracking van scores
- Integratie met SEO APIs

## Support

Voor vragen of problemen, controleer eerst of:
1. De URL correct is ingevoerd (inclusief http:// of https://)
2. De website publiek toegankelijk is
3. JavaScript is ingeschakeld in je browser
