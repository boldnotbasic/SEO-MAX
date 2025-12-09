class SEOChecker {
    constructor() {
        this.results = {};
        this.keyword = '';
        this.cache = new Map(); // Add caching for better performance
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
    }

    async analyzeWebsite(url, keyword = '') {
        this.keyword = keyword.toLowerCase();
        
        // Clean expired cache entries periodically
        if (Math.random() < 0.1) { // 10% chance to clean cache
            this.cleanCache();
        }
        
        // Check cache first
        const cacheKey = `${url}-${keyword}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            console.log('Using cached results for:', url);
            this.results = cached.results;
            return this.results;
        }
        
        try {
            const response = await this.fetchWithCORS(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            this.results = {
                url: url,
                keyword: keyword,
                status: await this.checkStatus(response),
                title: this.analyzeTitle(doc),
                h1: this.analyzeH1(doc),
                meta: this.analyzeMeta(doc),
                images: this.analyzeImages(doc),
                canonical: this.analyzeCanonical(doc, url),
                links: await this.analyzeLinks(doc, url),
                urlStructure: this.analyzeURL(url)
            };

            // Cache the results
            this.cache.set(cacheKey, {
                results: this.results,
                timestamp: Date.now()
            });

            return this.results;
        } catch (error) {
            throw new Error(`Fout bij analyseren: ${error.message}`);
        }
    }

    // Clean expired cache entries
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheExpiry) {
                this.cache.delete(key);
            }
        }
    }

    async fetchWithCORS(url) {
        // Probeer eerst directe toegang
        try {
            const response = await fetch(url, { 
                mode: 'cors',
                headers: {
                    'User-Agent': 'SEO-MAX-Bot/1.0'
                }
            });
            if (response.ok) {
                return response;
            }
        } catch (error) {
            console.log('Direct fetch failed, trying proxies...');
        }

        // Probeer verschillende proxy services
        const proxies = [
            // Eigen Vercel proxy (als deployed)
            `/api/proxy?url=${encodeURIComponent(url)}`,
            // Backup proxies
            `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            `https://cors-anywhere.herokuapp.com/${url}`,
            `https://thingproxy.freeboard.io/fetch/${url}`
        ];

        for (let i = 0; i < proxies.length; i++) {
            const proxyUrl = proxies[i];
            try {
                console.log(`Trying proxy ${i + 1}/${proxies.length}: ${proxyUrl}`);
                const response = await fetch(proxyUrl, {
                    timeout: 15000
                });
                
                if (proxyUrl.includes('/api/proxy')) {
                    // Eigen Vercel proxy
                    if (response.ok) {
                        const data = await response.json();
                        if (data.contents) {
                            return {
                                status: data.status || 200,
                                text: () => Promise.resolve(data.contents),
                                headers: new Headers(data.headers || {})
                            };
                        }
                    }
                } else if (proxyUrl.includes('allorigins.win')) {
                    // AllOrigins proxy
                    if (response.ok) {
                        const data = await response.json();
                        if (data.contents) {
                            return {
                                status: data.status?.http_code || 200,
                                text: () => Promise.resolve(data.contents),
                                headers: new Headers()
                            };
                        }
                    }
                } else {
                    // Andere proxies
                    if (response.ok) {
                        return response;
                    }
                }
            } catch (proxyError) {
                console.log(`Proxy ${i + 1} failed:`, proxyError.message);
                continue;
            }
        }
        
        throw new Error('Website niet bereikbaar via proxy services. Voor betrouwbare crawling: deploy naar Vercel/Netlify.');
    }

    async checkStatus(response) {
        const status = response.status;
        const headers = response.headers;
        
        return {
            statusCode: status,
            isSuccess: status >= 200 && status < 300,
            noindex: headers.get('x-robots-tag')?.includes('noindex') || false,
            nofollow: headers.get('x-robots-tag')?.includes('nofollow') || false
        };
    }

    analyzeTitle(doc) {
        const titleElement = doc.querySelector('title');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        return {
            exists: !!titleElement,
            content: title,
            length: title.length,
            isOptimal: title.length >= 30 && title.length <= 60,
            hasKeyword: this.keyword ? title.toLowerCase().includes(this.keyword) : null
        };
    }

    cleanHeadingText(text) {
        if (!text) return text;

        let cleaned = text.trim();

        // Verwijder slider-navigatie woorden aan de randen, maar laat normale zinnen met "links" of "rechtsaf" staan
        cleaned = cleaned.replace(/^Links\b\s*/i, '');
        cleaned = cleaned.replace(/\s*\bRechtsaf\b$/i, '');

        cleaned = cleaned.trim();
        return cleaned || text.trim();
    }

    analyzeH1(doc, keyword) {
        const h1Elements = doc.querySelectorAll('h1');
        const h1Count = h1Elements.length;
        const h1Texts = Array.from(h1Elements).map(h1 => this.cleanHeadingText(h1.textContent.trim()));
        
        let keywordInH1 = false;
        if (keyword) {
            keywordInH1 = h1Texts.some(text => 
                text.toLowerCase().includes(keyword.toLowerCase())
            );
        }
        
        return {
            count: h1Count,
            texts: h1Texts,
            isOptimal: h1Count === 1,
            keywordPresent: keywordInH1,
            isEmpty: h1Texts.some(text => text.length === 0),
            h1List: h1Texts // For popup display
        };
    }

    analyzeMeta(doc) {
        const metaDesc = doc.querySelector('meta[name="description"]');
        const robotsMeta = doc.querySelector('meta[name="robots"]');
        
        const description = metaDesc ? metaDesc.getAttribute('content').trim() : '';
        
        return {
            exists: !!metaDesc,
            content: description,
            length: description.length,
            isOptimal: description.length >= 120 && description.length <= 160,
            noindex: robotsMeta ? robotsMeta.getAttribute('content').includes('noindex') : false,
            nofollow: robotsMeta ? robotsMeta.getAttribute('content').includes('nofollow') : false
        };
    }

    analyzeImages(doc) {
        const images = doc.querySelectorAll('img');
        const totalImages = images.length;
        const imagesWithAlt = Array.from(images).filter(img => img.getAttribute('alt'));
        const imagesWithoutAlt = Array.from(images).filter(img => !img.getAttribute('alt'));
        
        // Extract filenames from images without alt text
        const missingAltImages = imagesWithoutAlt
            .map(img => {
                const src = (img.getAttribute('src') || '').trim();
                const filename = src.split('/').pop() || src;
                return {
                    filename: filename,
                    src: src,
                    fullUrl: img.src || src
                };
            })
            // Filter entries zonder bruikbare src / bestandsnaam, om lege kaarten te vermijden
            .filter(img => img.src && img.filename);
        
        return {
            total: totalImages,
            withAlt: imagesWithAlt.length,
            withoutAlt: imagesWithoutAlt.length,
            percentage: totalImages > 0 ? Math.round((imagesWithAlt.length / totalImages) * 100) : 100,
            missingAltImages: missingAltImages
        };
    }

    analyzeCanonical(doc, currentUrl) {
        const canonicalElement = doc.querySelector('link[rel="canonical"]');
        const canonicalUrl = canonicalElement ? canonicalElement.getAttribute('href') : null;
        
        return {
            exists: !!canonicalElement,
            url: canonicalUrl,
            isSelfReferencing: canonicalUrl === currentUrl,
            isValid: canonicalUrl ? this.isValidURL(canonicalUrl) : false
        };
    }

    async analyzeLinks(doc, baseUrl) {
        const links = doc.querySelectorAll('a[href]');
        const linkData = {
            total: links.length,
            internal: 0,
            external: 0,
            broken: 0,
            checked: 0
        };

        for (let link of Array.from(links).slice(0, 20)) {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
            
            try {
                const fullUrl = new URL(href, baseUrl).href;
                const isInternal = new URL(fullUrl).hostname === new URL(baseUrl).hostname;
                
                if (isInternal) {
                    linkData.internal++;
                } else {
                    linkData.external++;
                }
                
                linkData.checked++;
            } catch (error) {
                linkData.broken++;
            }
        }

        return linkData;
    }

    analyzeURL(url) {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        
        return {
            length: url.length,
            isShort: url.length <= 100,
            hasParameters: urlObj.search.length > 0,
            depth: path.split('/').filter(segment => segment).length,
            isReadable: !/[^a-zA-Z0-9\-\/\.]/.test(path),
            protocol: urlObj.protocol
        };
    }

    isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    calculateScore() {
        let score = 0;
        let maxScore = 0;

        if (this.results.status?.isSuccess) score += 15;
        maxScore += 15;

        if (this.results.title?.exists && this.results.title?.isOptimal) score += 15;
        maxScore += 15;

        if (this.results.h1?.isOptimal) score += 10;
        maxScore += 10;

        if (this.results.meta?.exists && this.results.meta?.isOptimal) score += 15;
        maxScore += 15;

        if (this.results.images?.percentage >= 80) score += 10;
        maxScore += 10;

        if (this.results.canonical?.exists) score += 10;
        maxScore += 10;

        if (this.results.links?.broken === 0) score += 10;
        maxScore += 10;

        if (this.results.urlStructure?.isShort && this.results.urlStructure?.isReadable) score += 15;
        maxScore += 15;

        return Math.round((score / maxScore) * 100);
    }
}

const seoChecker = new SEOChecker();

async function analyzeWebsite() {
    const urlInput = document.getElementById('urlInput');
    const keywordInput = document.getElementById('keywordInput');
    const loadingSection = document.getElementById('loadingSection');
    const resultsSection = document.getElementById('resultsSection');
    const analyzeBtn = document.getElementById('analyzeBtn');

    const url = urlInput.value.trim();
    const keyword = keywordInput.value.trim();

    if (!url) {
        showErrorMessage('URL Vereist', 'Voer een geldige URL in om te beginnen met de SEO analyse');
        return;
    }

    // Demo mode voor lokale testing
    if (url.toLowerCase().includes('demo') || url === 'demo') {
        showDemoResults(keyword);
        return;
    }

    try {
        analyzeBtn.disabled = true;
        loadingSection.style.display = 'block';
        resultsSection.style.display = 'none';

        const results = await seoChecker.analyzeWebsite(url, keyword);
        displayResults(results);

        loadingSection.style.display = 'none';
        resultsSection.style.display = 'block';
    } catch (error) {
        console.error('Analysis error:', error);
        
        // Show error in a less intrusive way
        showErrorMessage(`Analyse fout: ${error.message}`, 'Probeer demo mode door "demo" in te typen');
        
        loadingSection.style.display = 'none';
    } finally {
        analyzeBtn.disabled = false;
    }
}

function showErrorMessage(title, subtitle) {
    // Create error notification instead of alert
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-notification';
    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fas fa-exclamation-triangle"></i>
            <div class="error-text">
                <strong>${title}</strong>
                <p>${subtitle}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="error-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

function showDemoResults(keyword) {
    const demoKeyword = keyword || 'webdesign';
    
    // Verschillende demo scenario's
    const scenarios = {
        'webdesign': {
            title: `Professioneel ${demoKeyword} - Moderne websites`,
            h1: [`Beste ${demoKeyword} bureau`],
            meta: `Wij zijn gespecialiseerd in ${demoKeyword} en maken moderne, responsive websites die converteren.`,
            score: 'excellent'
        },
        'seo': {
            title: `${demoKeyword.toUpperCase()} Expert - Zoekmachine Optimalisatie`,
            h1: [`${demoKeyword.toUpperCase()} diensten voor betere rankings`],
            meta: `Professionele ${demoKeyword} diensten om je website hoger in Google te laten ranken. Meer verkeer gegarandeerd.`,
            score: 'good'
        },
        'marketing': {
            title: `Online ${demoKeyword} Bureau Amsterdam`,
            h1: [`Digitaal ${demoKeyword} dat werkt`],
            meta: `Verhoog je omzet met onze bewezen ${demoKeyword} strategieën. Specialist in online groei.`,
            score: 'average'
        }
    };
    
    const scenario = scenarios[demoKeyword.toLowerCase()] || scenarios['webdesign'];
    
    // Simuleer demo resultaten
    seoChecker.results = {
        url: `https://demo-${demoKeyword.toLowerCase()}.com`,
        keyword: demoKeyword,
        status: { statusCode: 200, isSuccess: true, noindex: false, nofollow: false },
        title: { 
            exists: true, 
            content: scenario.title, 
            length: scenario.title.length, 
            isOptimal: scenario.title.length >= 30 && scenario.title.length <= 60, 
            hasKeyword: scenario.title.toLowerCase().includes(demoKeyword.toLowerCase())
        },
        h1: { 
            count: 1, 
            isOptimal: true, 
            content: scenario.h1, 
            hasKeyword: scenario.h1[0].toLowerCase().includes(demoKeyword.toLowerCase())
        },
        meta: { 
            exists: true, 
            content: scenario.meta, 
            length: scenario.meta.length, 
            isOptimal: scenario.meta.length >= 120 && scenario.meta.length <= 160, 
            noindex: false, 
            nofollow: false 
        },
        images: { 
            total: Math.floor(Math.random() * 10) + 5, 
            withAlt: Math.floor(Math.random() * 8) + 4, 
            withoutAlt: Math.floor(Math.random() * 3), 
            percentage: Math.floor(Math.random() * 30) + 70 
        },
        canonical: { exists: true, url: `https://demo-${demoKeyword.toLowerCase()}.com`, isSelfReferencing: true, isValid: true },
        links: { 
            total: Math.floor(Math.random() * 20) + 10, 
            internal: Math.floor(Math.random() * 15) + 8, 
            external: Math.floor(Math.random() * 5) + 2, 
            broken: Math.floor(Math.random() * 2), 
            checked: Math.floor(Math.random() * 20) + 10 
        },
        urlStructure: { 
            length: `https://demo-${demoKeyword.toLowerCase()}.com`.length, 
            isShort: true, 
            hasParameters: false, 
            depth: 1, 
            isReadable: true, 
            protocol: 'https:' 
        }
    };
    
    // Bereken percentage voor images
    seoChecker.results.images.percentage = Math.round((seoChecker.results.images.withAlt / seoChecker.results.images.total) * 100);
    
    displayResults(seoChecker.results);
    document.getElementById('resultsSection').style.display = 'block';
    
    // Toon demo melding
    setTimeout(() => {
        alert(`✅ Demo analyse voltooid!\n\n🎯 Zoekwoord: "${demoKeyword}"\n📊 SEO Score: ${seoChecker.calculateScore()}%\n\n💡 Probeer verschillende zoekwoorden zoals:\n• seo\n• marketing\n• webshop\n• consultant`);
    }, 1000);
}

function displayResults(results) {
    try {
        console.log('Displaying results:', results);
        
        // Safe display with individual error handling
        safeDisplayFunction(() => displayDashboardStats(results), 'Dashboard Stats');
        safeDisplayFunction(() => displayCoreVitals(results), 'Core Vitals');
        safeDisplayFunction(() => displayTopIssues(results), 'Top Issues');
        safeDisplayFunction(() => displayStatusResults(results.status), 'Status Results');
        safeDisplayFunction(() => displayTitleResults(results.title), 'Title Results');
        safeDisplayFunction(() => displayH1Results(results.h1), 'H1 Results');
        safeDisplayFunction(() => displayMetaResults(results.meta), 'Meta Results');
        safeDisplayFunction(() => displayImageResults(results.images), 'Image Results');
        safeDisplayFunction(() => displayCanonicalResults(results.canonical), 'Canonical Results');
        safeDisplayFunction(() => displayLinksResults(results.links), 'Links Results');
        safeDisplayFunction(() => displayURLResults(results.urlStructure), 'URL Results');
        safeDisplayFunction(() => displaySummary(), 'Summary');
        
        console.log('All results displayed successfully');
        
        // Show save button after successful analysis
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.style.display = 'inline-flex';
        
        // Setup homepage preview
        setupHomepagePreview();
        
    } catch (error) {
        console.error('Display error:', error);
        // Don't show alert anymore, just log the error
    }
}

function safeDisplayFunction(displayFunc, name) {
    try {
        displayFunc();
    } catch (error) {
        console.warn(`Failed to display ${name}:`, error);
        // Continue with other displays instead of stopping
    }
}

function displayDashboardStats(results) {
    const score = seoChecker.calculateScore();
    
    // SEO Score with Circular Progress
    const scoreElement = document.getElementById('scoreValue');
    if (scoreElement) {
        scoreElement.textContent = score;
        updateCircularProgress(score);
    }
    
    const scoreTrend = document.getElementById('scoreTrend');
    if (scoreTrend) {
        if (score >= 80) {
            scoreTrend.textContent = '+' + Math.floor(Math.random() * 5 + 1);
            scoreTrend.className = 'stat-trend positive';
        } else if (score >= 60) {
            scoreTrend.textContent = '±0';
            scoreTrend.className = 'stat-trend neutral';
        } else {
            scoreTrend.textContent = '-' + Math.floor(Math.random() * 3 + 1);
            scoreTrend.className = 'stat-trend';
        }
    }
    
    // Content Health
    const contentElements = [results.title, results.h1, results.meta].filter(Boolean);
    const contentScore = contentElements.filter(el => el.exists || el.count > 0).length;
    const contentHealthEl = document.getElementById('contentHealth');
    const contentSubtitleEl = document.getElementById('contentSubtitle');
    if (contentHealthEl) contentHealthEl.textContent = contentScore;
    if (contentSubtitleEl) contentSubtitleEl.textContent = `${contentElements.length} elements checked`;
    
    // Technical SEO
    const techScore = Math.round((results.images.percentage + (results.canonical.exists ? 100 : 0) + (results.links.broken === 0 ? 100 : 50)) / 3);
    const techScoreEl = document.getElementById('techScore');
    if (techScoreEl) techScoreEl.textContent = techScore + '%';
    
    const techTrend = document.getElementById('techTrend');
    if (techTrend) {
        if (techScore >= 80) {
            techTrend.textContent = '+2';
            techTrend.className = 'stat-trend positive';
        } else {
            techTrend.textContent = '-1';
            techTrend.className = 'stat-trend';
        }
    }
    
    // Issues Count
    const issues = calculateIssues(results);
    const issuesCountEl = document.getElementById('issuesCount');
    const issuesSubtitleEl = document.getElementById('issuesSubtitle');
    if (issuesCountEl) issuesCountEl.textContent = issues.total;
    if (issuesSubtitleEl) issuesSubtitleEl.textContent = `${issues.critical} critical`;
    
    const issuesTrend = document.getElementById('issuesTrend');
    if (issuesTrend) {
        if (issues.total <= 2) {
            issuesTrend.textContent = '-1';
            issuesTrend.className = 'stat-trend positive';
        } else {
            issuesTrend.textContent = '+' + Math.floor(issues.total / 2);
            issuesTrend.className = 'stat-trend';
        }
    }
}

function displayCoreVitals(results) {
    // Title Optimization
    const titleScore = results.title.isOptimal ? 100 : (results.title.exists ? 60 : 0);
    updateVitalBar('titleProgress', titleScore);
    const titleScoreEl = document.getElementById('titleScore');
    if (titleScoreEl) titleScoreEl.textContent = titleScore + '%';
    
    // Meta Description
    const metaScore = results.meta.isOptimal ? 100 : (results.meta.exists ? 70 : 0);
    updateVitalBar('metaProgress', metaScore);
    const metaScoreEl = document.getElementById('metaScore');
    if (metaScoreEl) metaScoreEl.textContent = metaScore + '%';
    
    // Image Alt Text
    const imageScore = results.images.percentage;
    updateVitalBar('imageProgress', imageScore);
    const imageScoreEl = document.getElementById('imageScore');
    if (imageScoreEl) imageScoreEl.textContent = imageScore + '%';
}

function updateVitalBar(elementId, score) {
    const progressBar = document.getElementById(elementId);
    if (!progressBar) return;
    
    let className = 'vital-progress ';
    
    if (score >= 90) className += 'great';
    else if (score >= 70) className += 'good';
    else if (score >= 50) className += 'needs-improvement';
    else className += 'poor';
    
    progressBar.className = className;
    progressBar.style.width = score + '%';
}

function displayTopIssues(results) {
    const issues = [];
    
    if (!results.title.exists) {
        issues.push({ text: 'Title tag missing', type: 'error', count: 1 });
    } else if (!results.title.isOptimal) {
        issues.push({ text: 'Title length not optimal', type: 'warning', count: 1 });
    }
    
    if (!results.h1.isOptimal) {
        issues.push({ text: results.h1.count === 0 ? 'H1 tag missing' : 'Multiple H1 tags', type: 'error', count: Math.abs(results.h1.count - 1) });
    }
    
    if (!results.meta.exists) {
        issues.push({ text: 'Meta description missing', type: 'warning', count: 1 });
    } else if (!results.meta.isOptimal) {
        issues.push({ text: 'Meta description length not optimal', type: 'notice', count: 1 });
    }
    
    if (results.images.withoutAlt > 0) {
        issues.push({ text: 'Images without alt text', type: 'warning', count: results.images.withoutAlt });
    }
    
    if (!results.canonical.exists) {
        issues.push({ text: 'Canonical URL missing', type: 'notice', count: 1 });
    }
    
    const topIssuesContainer = document.getElementById('topIssues');
    if (!topIssuesContainer) return;
    
    if (issues.length === 0) {
        topIssuesContainer.innerHTML = '<div class="issue-item notice"><div class="issue-text"><i class="fas fa-check"></i> No major issues found</div></div>';
    } else {
        topIssuesContainer.innerHTML = issues.slice(0, 5).map(issue => `
            <div class="issue-item ${issue.type}">
                <div class="issue-text">
                    <i class="fas ${issue.type === 'error' ? 'fa-times' : issue.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info'}"></i>
                    ${issue.text}
                </div>
                <div class="issue-count">${issue.count}</div>
            </div>
        `).join('');
    }
}

function calculateIssues(results) {
    let total = 0;
    let critical = 0;
    
    if (!results.title.exists) { total++; critical++; }
    else if (!results.title.isOptimal) total++;
    
    if (!results.h1.isOptimal) {
        total++;
        if (results.h1.count === 0) critical++;
    }
    
    if (!results.meta.exists) total++;
    else if (!results.meta.isOptimal) total++;
    
    if (results.images.withoutAlt > 0) total++;
    if (!results.canonical.exists) total++;
    if (results.links.broken > 0) { total++; critical++; }
    
    return { total, critical };
}

function updateCircularProgress(score) {
    const circle = document.getElementById('progressCircle');
    const scoreStatus = document.getElementById('scoreStatus');
    if (!circle || !scoreStatus) return;
    
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    
    // Calculate progress
    const progress = score / 100;
    const strokeDashoffset = circumference - (progress * circumference);
    
    // Set color based on score (jouw gewenste ranges)
    let strokeColor = '';
    let statusText = '';
    
    if (score >= 70) {
        strokeColor = '#22c55e'; // Groen
        statusText = 'SEO Score: Goed';
    } else if (score >= 50) {
        strokeColor = '#f97316'; // Oranje  
        statusText = 'SEO Score: Gemiddeld';
    } else {
        strokeColor = '#ef4444'; // Rood
        statusText = 'SEO Score: Slecht';
    }
    
    // Set stroke color and status
    circle.style.stroke = strokeColor;
    scoreStatus.textContent = statusText;
    
    // Animate the circle with a delay for visual effect
    setTimeout(() => {
        circle.style.strokeDashoffset = strokeDashoffset;
    }, 500);
}

function displayStatusResults(status) {
    const container = document.getElementById('statusResults');
    container.innerHTML = `
        <div class="result-item ${status.isSuccess ? 'success' : 'error'}">
            <div class="label">
                <i class="fas ${status.isSuccess ? 'fa-check' : 'fa-times'}"></i>
                Status Code
            </div>
            <div class="value">
                <span class="status-badge ${status.isSuccess ? 'success' : 'error'}">
                    ${status.statusCode}
                </span>
            </div>
        </div>
        <div class="result-item ${status.noindex ? 'warning' : 'success'}">
            <div class="label">
                <i class="fas ${status.noindex ? 'fa-exclamation-triangle' : 'fa-check'}"></i>
                Indexering
            </div>
            <div class="value">${status.noindex ? 'Noindex gevonden' : 'Indexeerbaar'}</div>
        </div>
        <div class="result-item ${status.nofollow ? 'warning' : 'success'}">
            <div class="label">
                <i class="fas ${status.nofollow ? 'fa-exclamation-triangle' : 'fa-check'}"></i>
                Link Following
            </div>
            <div class="value">${status.nofollow ? 'Nofollow gevonden' : 'Links worden gevolgd'}</div>
        </div>
    `;
}

function displayTitleResults(title) {
    const container = document.getElementById('titleResults');
    const lengthStatus = title.isOptimal ? 'success' : (title.length < 30 ? 'warning' : 'error');
    const keywordStatus = title.hasKeyword === null ? 'success' : (title.hasKeyword ? 'success' : 'warning');
    
    container.innerHTML = `
        <div class="result-item ${title.exists ? 'success' : 'error'}">
            <div class="label">
                <i class="fas ${title.exists ? 'fa-check' : 'fa-times'}"></i>
                Title Tag Aanwezig
            </div>
            <div class="value">${title.exists ? 'Ja' : 'Nee'}</div>
        </div>
        ${title.exists ? `
        <div class="result-item ${lengthStatus}">
            <div class="label">
                <i class="fas fa-ruler"></i>
                Lengte
            </div>
            <div class="value">${title.length} karakters (optimaal: 30-60)</div>
        </div>
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-quote-right"></i>
                Inhoud
            </div>
            <div class="value">${title.content}</div>
        </div>
        ${seoChecker.keyword ? `
        <div class="result-item ${keywordStatus}">
            <div class="label">
                <i class="fas fa-key"></i>
                Zoekwoord
            </div>
            <div class="value">${title.hasKeyword ? 'Gevonden' : 'Niet gevonden'}</div>
        </div>
        ` : ''}
        ` : ''}
    `;
}

function displayH1Results(h1) {
    const container = document.getElementById('h1Results');
    const countStatus = h1.isOptimal ? 'success' : (h1.count === 0 ? 'error' : 'warning');
    const keywordStatus = h1.keywordPresent === null ? 'success' : (h1.keywordPresent ? 'success' : 'warning');
    
    container.innerHTML = `
        <div class="result-item ${countStatus} ${h1.count > 0 ? 'clickable' : ''}" ${h1.count > 0 ? `onclick="showH1Popup(${JSON.stringify(h1.h1List).replace(/"/g, '&quot;')})"` : ''}>
            <div class="label">
                <i class="fas fa-hashtag"></i>
                Aantal H1 Tags
            </div>
            <div class="value">${h1.count} (optimaal: 1) ${h1.count > 0 ? '<i class="fas fa-eye" style="margin-left: 8px; opacity: 0.7;"></i>' : ''}</div>
        </div>
        ${h1.count > 0 ? `
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-list"></i>
                H1 Inhoud
            </div>
            <div class="value">${h1.texts ? h1.texts.join(', ') : 'Geen H1 content'}</div>
        </div>
        ${seoChecker.keyword ? `
        <div class="result-item ${keywordStatus}">
            <div class="label">
                <i class="fas fa-key"></i>
                Zoekwoord in H1
            </div>
            <div class="value">${h1.keywordPresent ? 'Gevonden' : 'Niet gevonden'}</div>
        </div>
        ` : ''}
        ` : ''}
    `;
}

function displayMetaResults(meta) {
    const container = document.getElementById('metaResults');
    const lengthStatus = meta.isOptimal ? 'success' : (meta.length < 120 ? 'warning' : 'error');
    
    container.innerHTML = `
        <div class="result-item ${meta.exists ? 'success' : 'error'}">
            <div class="label">
                <i class="fas ${meta.exists ? 'fa-check' : 'fa-times'}"></i>
                Meta Description Aanwezig
            </div>
            <div class="value">${meta.exists ? 'Ja' : 'Nee'}</div>
        </div>
        ${meta.exists ? `
        <div class="result-item ${lengthStatus}">
            <div class="label">
                <i class="fas fa-ruler"></i>
                Lengte
            </div>
            <div class="value">${meta.length} karakters (optimaal: 120-160)</div>
        </div>
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-quote-right"></i>
                Inhoud
            </div>
            <div class="value">${meta.content}</div>
        </div>
        ` : ''}
    `;
}

function displayImageResults(images) {
    const container = document.getElementById('imageResults');
    const status = images.percentage >= 80 ? 'success' : (images.percentage >= 50 ? 'warning' : 'error');
    
    container.innerHTML = `
        <div class="result-item ${status}">
            <div class="label">
                <i class="fas fa-images"></i>
                Alt-text Coverage
            </div>
            <div class="value">${images.percentage}% (${images.withAlt}/${images.total} afbeeldingen)</div>
        </div>
        ${images.withoutAlt > 0 ? `
        <div class="result-item warning clickable" onclick="showMissingAltImages(${JSON.stringify(images.missingAltImages).replace(/"/g, '&quot;')})">
            <div class="label">
                <i class="fas fa-exclamation-triangle"></i>
                Ontbrekende Alt-text
            </div>
            <div class="value">${images.withoutAlt} afbeeldingen zonder alt-text <i class="fas fa-eye" style="margin-left: 8px; opacity: 0.7;"></i></div>
        </div>
        ` : ''}
    `;
}

function displayCanonicalResults(canonical) {
    const container = document.getElementById('canonicalResults');
    
    container.innerHTML = `
        <div class="result-item ${canonical.exists ? 'success' : 'warning'}">
            <div class="label">
                <i class="fas ${canonical.exists ? 'fa-check' : 'fa-exclamation-triangle'}"></i>
                Canonical Tag
            </div>
            <div class="value">${canonical.exists ? 'Aanwezig' : 'Ontbreekt'}</div>
        </div>
        ${canonical.exists ? `
        <div class="result-item ${canonical.isValid ? 'success' : 'error'}">
            <div class="label">
                <i class="fas fa-link"></i>
                Canonical URL
            </div>
            <div class="value">${canonical.url}</div>
        </div>
        <div class="result-item ${canonical.isSelfReferencing ? 'success' : 'warning'}">
            <div class="label">
                <i class="fas fa-sync"></i>
                Self-referencing
            </div>
            <div class="value">${canonical.isSelfReferencing ? 'Ja' : 'Nee'}</div>
        </div>
        ` : ''}
    `;
}

function displayLinksResults(links) {
    const container = document.getElementById('linksResults');
    const status = links.broken === 0 ? 'success' : 'warning';
    
    container.innerHTML = `
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-link"></i>
                Totaal Links Gecontroleerd
            </div>
            <div class="value">${links.checked} links</div>
        </div>
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-home"></i>
                Interne Links
            </div>
            <div class="value">${links.internal}</div>
        </div>
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-external-link-alt"></i>
                Externe Links
            </div>
            <div class="value">${links.external}</div>
        </div>
        <div class="result-item ${status}">
            <div class="label">
                <i class="fas ${links.broken === 0 ? 'fa-check' : 'fa-exclamation-triangle'}"></i>
                Broken Links
            </div>
            <div class="value">${links.broken}</div>
        </div>
    `;
}

function displayURLResults(urlStructure) {
    const container = document.getElementById('urlResults');
    
    container.innerHTML = `
        <div class="result-item ${urlStructure.isShort ? 'success' : 'warning'}">
            <div class="label">
                <i class="fas fa-ruler"></i>
                URL Lengte
            </div>
            <div class="value">${urlStructure.length} karakters ${urlStructure.isShort ? '(goed)' : '(te lang)'}</div>
        </div>
        <div class="result-item ${urlStructure.isReadable ? 'success' : 'warning'}">
            <div class="label">
                <i class="fas fa-eye"></i>
                Leesbaarheid
            </div>
            <div class="value">${urlStructure.isReadable ? 'Goed leesbaar' : 'Bevat speciale karakters'}</div>
        </div>
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-layer-group"></i>
                URL Diepte
            </div>
            <div class="value">${urlStructure.depth} niveaus</div>
        </div>
        <div class="result-item ${urlStructure.protocol === 'https:' ? 'success' : 'warning'}">
            <div class="label">
                <i class="fas fa-shield-alt"></i>
                Protocol
            </div>
            <div class="value">${urlStructure.protocol}</div>
        </div>
    `;
}

function displaySummary() {
    const container = document.getElementById('summaryResults');
    const score = seoChecker.calculateScore();
    
    let scoreClass = 'score-poor';
    let scoreText = 'Slecht';
    
    if (score >= 90) {
        scoreClass = 'score-excellent';
        scoreText = 'Uitstekend';
    } else if (score >= 70) {
        scoreClass = 'score-good';
        scoreText = 'Goed';
    } else if (score >= 50) {
        scoreClass = 'score-average';
        scoreText = 'Gemiddeld';
    }
    
    container.innerHTML = `
        <div class="score-circle ${scoreClass}">
            ${score}%
        </div>
        <h4 style="text-align: center; margin-bottom: 20px;">SEO Score: ${scoreText}</h4>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${score}%"></div>
        </div>
        <p style="text-align: center; margin-top: 15px; opacity: 0.9;">
            Gebaseerd op ${Object.keys(seoChecker.results).length - 2} SEO factoren
        </p>
    `;
}

document.getElementById('urlInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        analyzeWebsite();
    }
});

document.getElementById('keywordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        analyzeWebsite();
    }
});

// Website Crawler Class
class WebsiteCrawler {
    constructor() {
        this.foundUrls = new Set();
        this.crawledUrls = new Set();
        this.urlData = [];
        this.currentTab = 'all';
        this.isRunning = false;
    }

    async startCrawl(baseUrl, options = {}) {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.foundUrls.clear();
        this.crawledUrls.clear();
        this.urlData = [];
        
        const {
            depth = 1,
            includeExternal = true,
            checkRedirects = true,
            findImages = true
        } = options;

        try {
            this.showProgress();
            this.updateProgress(0, 'Crawling gestart...');
            
            await this.crawlPage(baseUrl, baseUrl, depth, {
                includeExternal,
                checkRedirects,
                findImages
            });
            
            this.updateProgress(100, 'Crawling voltooid!');
            this.displayResults();
            
        } catch (error) {
            console.error('Crawler error:', error);
            alert(`Crawler fout: ${error.message}`);
        } finally {
            this.isRunning = false;
            setTimeout(() => this.hideProgress(), 1000);
        }
    }

    async crawlPage(url, baseUrl, depth, options) {
        if (depth <= 0 || this.crawledUrls.has(url)) return;
        
        this.crawledUrls.add(url);
        this.updateProgress(
            (this.crawledUrls.size / Math.max(this.foundUrls.size, 1)) * 100,
            `Crawling: ${this.getShortUrl(url)}`
        );

        try {
            const response = await seoChecker.fetchWithCORS(url);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            
            // Extract all links
            const links = doc.querySelectorAll('a[href]');
            const images = doc.querySelectorAll('img[src]');
            
            // Process links
            for (const link of links) {
                const href = link.getAttribute('href');
                if (!href) continue;
                
                const absoluteUrl = this.resolveUrl(href, url);
                if (!absoluteUrl) continue;
                
                const isInternal = this.isInternalUrl(absoluteUrl, baseUrl);
                const urlInfo = {
                    url: absoluteUrl,
                    type: 'link',
                    internal: isInternal,
                    foundOn: url,
                    text: link.textContent?.trim() || '',
                    status: null,
                    redirectTo: null
                };

                // Check for duplicates - only add if URL doesn't exist yet
                const existingUrl = this.urlData.find(existing => 
                    existing.url === absoluteUrl && existing.type === 'link'
                );
                
                if (!existingUrl) {
                    this.urlData.push(urlInfo);
                } else {
                    // Update existing entry with additional info if needed
                    if (urlInfo.text && !existingUrl.text) {
                        existingUrl.text = urlInfo.text;
                    }
                    // Add found on page to existing entry
                    if (!existingUrl.foundOnPages) {
                        existingUrl.foundOnPages = [existingUrl.foundOn];
                    }
                    if (!existingUrl.foundOnPages.includes(url)) {
                        existingUrl.foundOnPages.push(url);
                    }
                }
                
                // Add to crawl queue if internal and within depth
                if (isInternal && depth > 1) {
                    this.foundUrls.add(absoluteUrl);
                }
            }

            // Process images
            if (options.findImages) {
                for (const img of images) {
                    const src = img.getAttribute('src');
                    if (!src) continue;
                    
                    const absoluteUrl = this.resolveUrl(src, url);
                    if (!absoluteUrl) continue;
                    
                    const imageInfo = {
                        url: absoluteUrl,
                        type: 'image',
                        internal: this.isInternalUrl(absoluteUrl, baseUrl),
                        foundOn: url,
                        alt: img.getAttribute('alt') || '',
                        status: null
                    };

                    // Check for duplicate images
                    const existingImage = this.urlData.find(existing => 
                        existing.url === absoluteUrl && existing.type === 'image'
                    );
                    
                    if (!existingImage) {
                        this.urlData.push(imageInfo);
                    } else {
                        // Update alt text if current one is empty
                        if (imageInfo.alt && !existingImage.alt) {
                            existingImage.alt = imageInfo.alt;
                        }
                        // Track found on pages
                        if (!existingImage.foundOnPages) {
                            existingImage.foundOnPages = [existingImage.foundOn];
                        }
                        if (!existingImage.foundOnPages.includes(url)) {
                            existingImage.foundOnPages.push(url);
                        }
                    }
                }
            }

        } catch (error) {
            console.error(`Failed to crawl ${url}:`, error);
        }
    }

    resolveUrl(href, baseUrl) {
        try {
            return new URL(href, baseUrl).href;
        } catch {
            return null;
        }
    }

    isInternalUrl(url, baseUrl) {
        try {
            const urlObj = new URL(url);
            const baseObj = new URL(baseUrl);
            return urlObj.hostname === baseObj.hostname;
        } catch {
            return false;
        }
    }

    getShortUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname + urlObj.search;
        } catch {
            return url;
        }
    }

    showProgress() {
        const progressEl = document.getElementById('crawlerProgress');
        const resultsEl = document.getElementById('crawlerResults');
        if (progressEl) progressEl.style.display = 'block';
        if (resultsEl) resultsEl.style.display = 'none';
    }

    hideProgress() {
        const progressEl = document.getElementById('crawlerProgress');
        if (progressEl) progressEl.style.display = 'none';
    }

    updateProgress(percent, status) {
        const fill = document.getElementById('crawlerProgressFill');
        const statusEl = document.getElementById('crawlerStatus');
        const countEl = document.getElementById('crawlerCount');
        
        if (fill) fill.style.width = percent + '%';
        if (statusEl) statusEl.textContent = status;
        if (countEl) countEl.textContent = `${this.urlData.length} URLs gevonden`;
    }

    displayResults() {
        const resultsEl = document.getElementById('crawlerResults');
        if (resultsEl) resultsEl.style.display = 'block';
        
        const stats = this.calculateStats();
        this.updateStats(stats);
        this.showTab('all');
    }

    calculateStats() {
        const total = this.urlData.length;
        const internal = this.urlData.filter(u => u.internal).length;
        const external = total - internal;
        const redirects = this.urlData.filter(u => u.status === 'redirect' || u.redirectTo).length;
        
        return { total, internal, external, redirects };
    }

    updateStats(stats) {
        const elements = {
            totalUrls: stats.total,
            internalUrls: stats.internal,
            externalUrls: stats.external,
            redirectUrls: stats.redirects
        };
        
        for (const [id, value] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
    }

    showTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[onclick="showTab('${tab}')"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Filter and display URLs
        let filteredUrls = this.urlData;
        
        switch (tab) {
            case 'internal':
                filteredUrls = this.urlData.filter(u => u.internal);
                break;
            case 'external':
                filteredUrls = this.urlData.filter(u => !u.internal);
                break;
            case 'redirects':
                filteredUrls = this.urlData.filter(u => u.status === 'redirect' || u.redirectTo);
                break;
            case 'images':
                filteredUrls = this.urlData.filter(u => u.type === 'image');
                break;
        }
        
        this.renderUrlList(filteredUrls);
    }

    renderUrlList(urls) {
        const container = document.getElementById('urlsList');
        if (!container) return;
        
        if (urls.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.5);">Geen URLs gevonden in deze categorie</div>';
            return;
        }
        
        container.innerHTML = urls.map(url => `
            <div class="url-item">
                <div class="url-info">
                    <a href="${url.url}" target="_blank" class="url-link">${url.url}</a>
                    <div class="url-meta">
                        ${url.type === 'image' ? `Alt: ${url.alt || 'Geen alt text'}` : ''}
                        ${url.text ? `Text: ${url.text.substring(0, 50)}${url.text.length > 50 ? '...' : ''}` : ''}
                        ${this.getFoundOnInfo(url)}
                    </div>
                </div>
                <div class="url-status">
                    ${this.getStatusBadge(url)}
                    ${this.getFrequencyBadge(url)}
                </div>
            </div>
        `).join('');
    }

    getFoundOnInfo(url) {
        if (url.foundOnPages && url.foundOnPages.length > 1) {
            return `Gevonden op ${url.foundOnPages.length} pagina's`;
        } else if (url.foundOn) {
            return `Gevonden op: ${this.getShortUrl(url.foundOn)}`;
        }
        return '';
    }

    getFrequencyBadge(url) {
        const count = url.foundOnPages ? url.foundOnPages.length : 1;
        if (count > 1) {
            return `<span class="status-badge frequency">${count}x</span>`;
        }
        return '';
    }

    getStatusBadge(url) {
        if (url.status === 'redirect' || url.redirectTo) {
            return '<span class="status-badge redirect">Redirect</span>';
        } else if (url.status === 'error') {
            return '<span class="status-badge error">Error</span>';
        } else if (url.status && url.status >= 200 && url.status < 300) {
            return '<span class="status-badge success">OK</span>';
        }
        return '';
    }

    exportUrls(format) {
        const data = this.urlData.map(url => ({
            URL: url.url,
            Type: url.type,
            Internal: url.internal ? 'Yes' : 'No',
            Status: url.status || 'Unknown',
            'Found On': url.foundOn,
            Text: url.text || url.alt || ''
        }));

        if (format === 'csv') {
            this.downloadCSV(data, 'website-urls.csv');
        } else {
            this.downloadTXT(data, 'website-urls.txt');
        }
    }

    downloadCSV(data, filename) {
        const headers = Object.keys(data[0]);
        const csv = [
            headers.join(','),
            ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
        ].join('\n');
        
        this.downloadFile(csv, filename, 'text/csv');
    }

    downloadTXT(data, filename) {
        const txt = data.map(row => row.URL).join('\n');
        this.downloadFile(txt, filename, 'text/plain');
    }

    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Sitewide SEO Analyzer Class
class SitewideAnalyzer {
    constructor() {
        this.seoChecker = new SEOChecker();
        this.analyzedPages = [];
        this.isRunning = false;
        this.maxPages = 10; // Limit voor performance
    }

    async analyzeSitewide(baseUrl, keyword = '', options = {}) {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.analyzedPages = [];
        
        const {
            maxPages = this.maxPages,
            includeSubdomains = false
        } = options;

        try {
            this.showSitewideProgress();
            this.updateSitewideProgress(0, 'Pagina\'s ontdekken...');
            
            // Stap 1: Vind alle interne pagina's
            const internalUrls = await this.discoverInternalPages(baseUrl, maxPages, includeSubdomains);
            
            // Stap 2: Analyseer elke pagina
            let completed = 0;
            for (const url of internalUrls) {
                try {
                    this.updateSitewideProgress(
                        (completed / internalUrls.length) * 100,
                        `Analyseren: ${this.getShortUrl(url)}`
                    );
                    
                    const pageAnalysis = await this.analyzePageSEO(url, keyword);
                    this.analyzedPages.push(pageAnalysis);
                    
                } catch (error) {
                    console.error(`Failed to analyze ${url}:`, error);
                    // Voeg foutpagina toe aan resultaten
                    this.analyzedPages.push({
                        url: url,
                        error: error.message,
                        score: 0,
                        timestamp: new Date().toISOString()
                    });
                }
                completed++;
            }
            
            this.updateSitewideProgress(100, 'Sitewide analyse voltooid!');
            
            // Stap 3: Bereken sitewide statistieken
            const sitewideResults = this.calculateSitewideStats();
            
            // Stap 4: Toon resultaten
            this.displaySitewideResults(sitewideResults);
            
            return sitewideResults;
            
        } catch (error) {
            console.error('Sitewide analysis error:', error);
            this.showSitewideError(`Sitewide analyse fout: ${error.message}`);
        } finally {
            this.isRunning = false;
            setTimeout(() => this.hideSitewideProgress(), 1000);
        }
    }

    async discoverInternalPages(baseUrl, maxPages, includeSubdomains) {
        const foundUrls = new Set([baseUrl]);
        const crawledUrls = new Set();
        const urlsToCheck = [baseUrl];
        
        while (urlsToCheck.length > 0 && foundUrls.size < maxPages) {
            const currentUrl = urlsToCheck.shift();
            if (crawledUrls.has(currentUrl)) continue;
            
            crawledUrls.add(currentUrl);
            
            try {
                const response = await this.seoChecker.fetchWithCORS(currentUrl);
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                
                // Vind alle interne links
                const links = doc.querySelectorAll('a[href]');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (!href) continue;
                    
                    const absoluteUrl = this.resolveUrl(href, currentUrl);
                    if (!absoluteUrl) continue;
                    
                    if (this.isInternalUrl(absoluteUrl, baseUrl, includeSubdomains)) {
                        // Filter uit: anchors, parameters, duplicaten
                        const cleanUrl = this.cleanUrl(absoluteUrl);
                        if (cleanUrl && !foundUrls.has(cleanUrl) && foundUrls.size < maxPages) {
                            foundUrls.add(cleanUrl);
                            urlsToCheck.push(cleanUrl);
                        }
                    }
                }
            } catch (error) {
                console.error(`Failed to crawl ${currentUrl} for links:`, error);
            }
        }
        
        return Array.from(foundUrls).slice(0, maxPages);
    }

    async analyzePageSEO(url, keyword) {
        console.log(`=== ANALYZING PAGE: ${url} ===`);
        const results = await this.seoChecker.analyzeWebsite(url, keyword);
        const score = this.seoChecker.calculateScore();
        
        console.log('Raw SEO results:', results);
        console.log('Title analysis:', results.title);
        console.log('H1 analysis:', results.h1);
        console.log('Meta analysis:', results.meta);
        
        // Extract data with detailed logging
        const extractedTitle = results.title?.content || 'Geen title';
        const extractedH1 = results.h1?.texts?.[0] || 'Geen H1';
        const extractedMeta = results.meta?.content || 'Geen meta description';
        
        console.log('Extracted data:', {
            title: extractedTitle,
            h1: extractedH1,
            meta: extractedMeta
        });
        console.log('=== END ANALYSIS ===');
        
        return {
            url: url,
            keyword: keyword,
            results: results,
            score: score,
            // Add direct access to common fields for table display
            title: extractedTitle,
            h1: extractedH1,
            metaDescription: extractedMeta,
            timestamp: new Date().toISOString(),
            issues: this.extractPageIssues(results)
        };
    }

    extractPageIssues(results) {
        const issues = [];
        
        if (!results.title?.exists) {
            issues.push({ type: 'error', message: 'Title tag ontbreekt' });
        } else if (!results.title?.isOptimal) {
            issues.push({ type: 'warning', message: 'Title lengte niet optimaal' });
        }
        
        if (!results.h1?.isOptimal) {
            issues.push({ 
                type: results.h1?.count === 0 ? 'error' : 'warning', 
                message: results.h1?.count === 0 ? 'H1 tag ontbreekt' : 'Meerdere H1 tags' 
            });
        }
        
        if (!results.meta?.exists) {
            issues.push({ type: 'warning', message: 'Meta description ontbreekt' });
        }
        
        if (results.images?.withoutAlt > 0) {
            issues.push({ 
                type: 'warning', 
                message: `${results.images.withoutAlt} afbeeldingen zonder alt-text` 
            });
        }
        
        return issues;
    }

    calculateSitewideStats() {
        const totalPages = this.analyzedPages.length;
        const successfulPages = this.analyzedPages.filter(p => !p.error);
        
        if (successfulPages.length === 0) {
            return {
                totalPages: totalPages,
                successfulPages: 0,
                averageScore: 0,
                pages: this.analyzedPages,
                issues: [],
                recommendations: []
            };
        }
        
        const averageScore = Math.round(
            successfulPages.reduce((sum, page) => sum + page.score, 0) / successfulPages.length
        );
        
        // Verzamel alle issues
        const allIssues = [];
        successfulPages.forEach(page => {
            page.issues?.forEach(issue => {
                const existingIssue = allIssues.find(i => i.message === issue.message);
                if (existingIssue) {
                    existingIssue.count++;
                    existingIssue.pages.push(page.url);
                } else {
                    allIssues.push({
                        type: issue.type,
                        message: issue.message,
                        count: 1,
                        pages: [page.url]
                    });
                }
            });
        });
        
        // Sorteer issues op ernst en frequentie
        allIssues.sort((a, b) => {
            const typeWeight = { error: 3, warning: 2, notice: 1 };
            const aWeight = (typeWeight[a.type] || 1) * a.count;
            const bWeight = (typeWeight[b.type] || 1) * b.count;
            return bWeight - aWeight;
        });
        
        return {
            totalPages: totalPages,
            successfulPages: successfulPages.length,
            averageScore: averageScore,
            pages: this.analyzedPages,
            issues: allIssues.slice(0, 10), // Top 10 issues
            recommendations: this.generateRecommendations(allIssues, averageScore)
        };
    }

    generateRecommendations(issues, averageScore) {
        const recommendations = [];
        
        if (averageScore < 50) {
            recommendations.push('🚨 Prioriteit: Focus op basis SEO elementen (title, H1, meta description)');
        } else if (averageScore < 70) {
            recommendations.push('⚠️ Verbetering: Werk aan technische SEO aspecten');
        } else {
            recommendations.push('✅ Goed: Focus op content optimalisatie en gebruikerservaring');
        }
        
        // Issue-specifieke aanbevelingen
        issues.slice(0, 3).forEach(issue => {
            if (issue.message.includes('Title')) {
                recommendations.push(`📝 Voeg unieke, beschrijvende titles toe aan ${issue.count} pagina's`);
            } else if (issue.message.includes('H1')) {
                recommendations.push(`🏷️ Zorg voor één duidelijke H1 per pagina op ${issue.count} pagina's`);
            } else if (issue.message.includes('Meta description')) {
                recommendations.push(`📄 Schrijf aantrekkelijke meta descriptions voor ${issue.count} pagina's`);
            }
        });
        
        return recommendations.slice(0, 5); // Max 5 aanbevelingen
    }

    // Helper methods
    resolveUrl(href, baseUrl) {
        try {
            return new URL(href, baseUrl).href;
        } catch {
            return null;
        }
    }

    isInternalUrl(url, baseUrl, includeSubdomains) {
        try {
            const urlObj = new URL(url);
            const baseObj = new URL(baseUrl);
            
            if (includeSubdomains) {
                return urlObj.hostname.endsWith(baseObj.hostname) || 
                       baseObj.hostname.endsWith(urlObj.hostname);
            } else {
                return urlObj.hostname === baseObj.hostname;
            }
        } catch {
            return false;
        }
    }

    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            // Verwijder anchors en sommige parameters
            urlObj.hash = '';
            // Behoud belangrijke parameters, verwijder tracking
            const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
            paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
            return urlObj.href;
        } catch {
            return url;
        }
    }

    getShortUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname + urlObj.search;
        } catch {
            return url;
        }
    }

    // UI Methods (worden later geïmplementeerd)
    showSitewideProgress() {
        // TODO: Implementeer sitewide progress UI
        console.log('Sitewide analysis started');
    }

    updateSitewideProgress(percent, status) {
        console.log(`Progress: ${percent}% - ${status}`);
    }

    hideSitewideProgress() {
        console.log('Sitewide analysis completed');
    }

    displaySitewideResults(results) {
        console.log('Sitewide results:', results);
        // TODO: Implementeer results display UI
    }

    showSitewideError(message) {
        console.error('Sitewide error:', message);
        // TODO: Implementeer error display
    }
}

// Initialize crawler
const websiteCrawler = new WebsiteCrawler();
const sitewideAnalyzer = new SitewideAnalyzer();

// Crawler functions
let selectedCrawlerUrl = '';

function useMainUrl() {
    const mainUrl = document.getElementById('urlInput').value.trim();
    
    if (!mainUrl || mainUrl.toLowerCase() === 'demo') {
        showErrorMessage('Geen geldige URL gevonden', 'Voer eerst een URL in het bovenste veld in');
        return;
    }
    
    // Ensure URL has protocol
    let processedUrl = mainUrl;
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
    }
    
    selectedCrawlerUrl = processedUrl;
    
    // Update display
    const displayEl = document.getElementById('crawlerUrlDisplay');
    if (displayEl) {
        displayEl.textContent = processedUrl;
        displayEl.classList.remove('empty');
    }
    
    // Enable crawl button
    const crawlBtn = document.getElementById('crawlBtn');
    if (crawlBtn) {
        crawlBtn.disabled = false;
    }
    
    // Show success notification
    analysisStorage.showSaveNotification('URL geselecteerd voor crawling!');
}

function startCrawling() {
    if (!selectedCrawlerUrl) {
        showErrorMessage('Geen URL geselecteerd', 'Klik eerst op "Gebruik URL hierboven"');
        return;
    }
    
    const depth = 1; // Fixed depth for URL discovery
    const includeExternal = document.getElementById('includeExternal')?.checked;
    const checkRedirects = document.getElementById('checkRedirects')?.checked;
    const findImages = document.getElementById('findImages')?.checked;
    
    websiteCrawler.startCrawl(selectedCrawlerUrl, {
        depth,
        includeExternal,
        checkRedirects,
        findImages
    });
}

// Initialize crawler UI
document.addEventListener('DOMContentLoaded', function() {
    // Disable crawl button initially
    const crawlBtn = document.getElementById('crawlBtn');
    if (crawlBtn) {
        crawlBtn.disabled = true;
    }
    
    // Monitor main URL input for changes
    const urlInput = document.getElementById('urlInput');
    if (urlInput) {
        urlInput.addEventListener('input', function() {
            // Reset crawler URL when main URL changes
            selectedCrawlerUrl = '';
            const displayEl = document.getElementById('crawlerUrlDisplay');
            if (displayEl) {
                displayEl.textContent = 'Geen URL geselecteerd';
                displayEl.classList.add('empty');
            }
            
            // Disable crawl button
            const crawlBtn = document.getElementById('crawlBtn');
            if (crawlBtn) {
                crawlBtn.disabled = true;
            }
        });
    }
});

function showTab(tab) {
    websiteCrawler.showTab(tab);
}

function exportUrls(format) {
    websiteCrawler.exportUrls(format);
}

// Save/Load Analysis System
class AnalysisStorage {
    constructor() {
        this.storageKey = 'seomax_saved_analyses';
        this.maxSaved = 10; // Limit to 10 saved analyses
        this.loadSavedAnalyses();
    }

    saveAnalysis(url, keyword, results, score) {
        const analysis = {
            id: Date.now().toString(),
            url: url,
            keyword: keyword,
            results: results,
            score: score,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('nl-NL'),
            time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        };

        let saved = this.getSavedAnalyses();
        
        // Remove oldest if at limit
        if (saved.length >= this.maxSaved) {
            saved = saved.slice(-(this.maxSaved - 1));
        }
        
        // Add new analysis at the beginning
        saved.unshift(analysis);
        
        localStorage.setItem(this.storageKey, JSON.stringify(saved));
        this.displaySavedAnalyses();
        
        // Show success notification
        this.showSaveNotification('Analyse opgeslagen!');
    }

    getSavedAnalyses() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch {
            return [];
        }
    }

    loadAnalysis(id) {
        const saved = this.getSavedAnalyses();
        const analysis = saved.find(a => a.id === id);
        
        if (!analysis) {
            alert('Analyse niet gevonden');
            return;
        }

        // Fill form fields
        document.getElementById('urlInput').value = analysis.url;
        document.getElementById('keywordInput').value = analysis.keyword || '';
        
        // Display results
        seoChecker.results = analysis.results;
        displayResults(analysis.results);
        
        // Show results section
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
        
        // Show save button
        document.getElementById('saveBtn').style.display = 'inline-flex';
        
        this.showSaveNotification('Analyse geladen!');
    }

    deleteAnalysis(id) {
        if (!confirm('Weet je zeker dat je deze analyse wilt verwijderen?')) {
            return;
        }

        let saved = this.getSavedAnalyses();
        saved = saved.filter(a => a.id !== id);
        
        localStorage.setItem(this.storageKey, JSON.stringify(saved));
        this.displaySavedAnalyses();
        
        this.showSaveNotification('Analyse verwijderd');
    }

    clearAllSaved() {
        if (!confirm('Weet je zeker dat je alle opgeslagen analyses wilt verwijderen?')) {
            return;
        }

        localStorage.removeItem(this.storageKey);
        this.displaySavedAnalyses();
        
        this.showSaveNotification('Alle analyses verwijderd');
    }

    displaySavedAnalyses() {
        const saved = this.getSavedAnalyses();
        const section = document.getElementById('savedAnalysesSection');
        const list = document.getElementById('savedAnalysesList');
        
        if (saved.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        
        list.innerHTML = saved.map(analysis => `
            <div class="saved-item">
                <div class="saved-item-header">
                    <div class="saved-item-info">
                        <div class="saved-item-url">${analysis.url}</div>
                        <div class="saved-item-meta">
                            <span><i class="fas fa-calendar"></i> ${analysis.date}</span>
                            <span><i class="fas fa-clock"></i> ${analysis.time}</span>
                            ${analysis.keyword ? `<span><i class="fas fa-key"></i> ${analysis.keyword}</span>` : ''}
                            <span class="saved-score ${this.getScoreClass(analysis.score)}">
                                <i class="fas fa-chart-line"></i> ${analysis.score}%
                            </span>
                        </div>
                    </div>
                    <div class="saved-item-actions">
                        <button class="load-btn" onclick="analysisStorage.loadAnalysis('${analysis.id}')">
                            <i class="fas fa-upload"></i> Laden
                        </button>
                        <button class="delete-btn" onclick="analysisStorage.deleteAnalysis('${analysis.id}')">
                            <i class="fas fa-trash"></i> Verwijder
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getScoreClass(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 50) return 'average';
        return 'poor';
    }

    showSaveNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'save-notification';
        notification.innerHTML = `
            <div class="save-notification-content">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

    loadSavedAnalyses() {
        // Load saved analyses on page load
        setTimeout(() => this.displaySavedAnalyses(), 100);
    }
}

// Initialize storage system
const analysisStorage = new AnalysisStorage();

// Save/Load functions
function saveAnalysis() {
    const url = document.getElementById('urlInput').value;
    const keyword = document.getElementById('keywordInput').value;
    
    if (!url || !seoChecker.results) {
        alert('Geen analyse om op te slaan. Voer eerst een analyse uit.');
        return;
    }

    const score = seoChecker.calculateScore();
    analysisStorage.saveAnalysis(url, keyword, seoChecker.results, score);
}

function clearAllSaved() {
    analysisStorage.clearAllSaved();
}

// Missing Alt-text Popup
function showMissingAltImages(missingImages) {
    const modal = document.createElement('div');
    modal.className = 'alt-text-modal';
    modal.innerHTML = `
        <div class="alt-text-modal-content">
            <div class="alt-text-header">
                <h3><i class="fas fa-exclamation-triangle"></i> Afbeeldingen zonder Alt-text</h3>
                <button onclick="this.closest('.alt-text-modal').remove()" class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="alt-text-body">
                <p>De volgende afbeeldingen hebben geen alt-text:</p>
                <div class="missing-images-list">
                    ${missingImages.map((img, index) => `
                        <div class="missing-image-item">
                            <div class="image-info">
                                <i class="fas fa-image"></i>
                                <div class="image-details">
                                    <div class="image-filename">${img.filename}</div>
                                    <div class="image-path">${img.src}</div>
                                </div>
                            </div>
                            <button onclick="copyToClipboard('${img.filename}')" class="copy-btn" title="Kopieer bestandsnaam">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
                <div class="alt-text-footer">
                    <p><i class="fas fa-lightbulb"></i> <strong>Tip:</strong> Voeg beschrijvende alt-text toe aan deze afbeeldingen voor betere SEO en toegankelijkheid.</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        analysisStorage.showSaveNotification(`"${text}" gekopieerd!`);
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        analysisStorage.showSaveNotification(`"${text}" gekopieerd!`);
    });
}

// Homepage Preview Setup
function setupHomepagePreview() {
    const previewUrl = document.getElementById('previewUrl');
    const previewOverlay = document.getElementById('previewOverlay');
    const homepageFrame = document.getElementById('homepageFrame');
    
    if (!previewUrl || !previewOverlay || !homepageFrame) return;
    
    // Get the URL from the analysis results instead of the input field
    const analyzedUrl = seoChecker.results?.url;
    
    if (!analyzedUrl || analyzedUrl.toLowerCase().includes('demo')) {
        previewUrl.textContent = 'Demo mode - geen preview beschikbaar';
        return;
    }
    
    // Ensure URL has protocol
    let processedUrl = analyzedUrl;
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
    }
    
    // Make preview URL clickable
    previewUrl.innerHTML = `<a href="${processedUrl}" target="_blank" style="color: inherit; text-decoration: none;">${processedUrl}</a>`;
    previewUrl.style.cursor = 'pointer';
    previewUrl.title = 'Klik om website te openen';
    
    // Automatically load the preview without requiring a click
    loadHomepagePreview(processedUrl, homepageFrame, previewOverlay);
}

function loadHomepagePreview(url, iframe, overlay) {
    try {
        // Show loading state
        overlay.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <p>Screenshot laden...</p>
        `;
        
        // Use screenshot API instead of iframe
        loadScreenshot(url, iframe, overlay);
        
    } catch (error) {
        console.error('Preview load error:', error);
        showPreviewFallback(url, overlay);
    }
}

function loadScreenshot(url, iframe, overlay) {
    // Use free screenshot services
    const screenshotServices = [
        `https://api.thumbnail.ws/api/f7e5b7e4e4e5b4e4e4e4e4e4e4e4e4e4e4e4e4e4/thumbnail/get?url=${encodeURIComponent(url)}&width=1200`,
        `https://mini.s-shot.ru/1024x768/JPEG/1024/Z100/?${encodeURIComponent(url)}`,
        `https://image.thum.io/get/width/1200/crop/800/${encodeURIComponent(url)}`
    ];
    
    // Replace iframe with image
    const img = document.createElement('img');
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '8px';
    img.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    
    let serviceIndex = 0;
    let loaded = false;
    
    function tryNextService() {
        if (serviceIndex >= screenshotServices.length) {
            // All services failed, show fallback
            showPreviewFallback(url, overlay);
            return;
        }
        
        const screenshotUrl = screenshotServices[serviceIndex];
        
        img.onload = function() {
            if (!loaded) {
                loaded = true;
                // Replace iframe with image
                iframe.style.display = 'none';
                iframe.parentNode.appendChild(img);
                overlay.classList.add('hidden');
            }
        };
        
        img.onerror = function() {
            if (!loaded) {
                serviceIndex++;
                setTimeout(tryNextService, 500); // Small delay between attempts
            }
        };
        
        // Set timeout for each service
        setTimeout(() => {
            if (!loaded && serviceIndex === screenshotServices.indexOf(screenshotUrl)) {
                serviceIndex++;
                tryNextService();
            }
        }, 5000);
        
        img.src = screenshotUrl;
    }
    
    tryNextService();
}

function showPreviewFallback(url, overlay) {
    overlay.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <i class="fas fa-external-link-alt" style="font-size: 2rem; color: white; margin-bottom: 12px;"></i>
            <p style="margin: 0 0 12px 0; color: white;">Preview niet beschikbaar</p>
            <a href="${url}" target="_blank" style="
                display: inline-block;
                background: rgba(255, 255, 255, 0.2);
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                text-decoration: none;
                font-size: 0.9rem;
                border: 1px solid rgba(255, 255, 255, 0.3);
                transition: all 0.3s ease;
            " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
                <i class="fas fa-external-link-alt"></i> Open Website
            </a>
            <p style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.7); margin: 8px 0 0 0;">CORS beperking</p>
        </div>
    `;
}

// H1 Tags Popup
function showH1Popup(h1List) {
    const modal = document.createElement('div');
    modal.className = 'h1-modal';
    modal.innerHTML = `
        <div class="h1-modal-content">
            <div class="h1-header">
                <h3><i class="fas fa-hashtag"></i> H1 Tags op de pagina</h3>
                <button onclick="this.closest('.h1-modal').remove()" class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="h1-body">
                <p>Gevonden H1 tags (${h1List.length}):</p>
                <div class="h1-list">
                    ${h1List.map((h1Text, index) => `
                        <div class="h1-item">
                            <div class="h1-info">
                                <div class="h1-number">#${index + 1}</div>
                                <div class="h1-text">${h1Text || '<em>Lege H1 tag</em>'}</div>
                            </div>
                            <button onclick="copyToClipboard('${h1Text.replace(/'/g, "\\'")}'); event.stopPropagation();" class="copy-btn" title="Kopieer H1 tekst">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
                <div class="h1-footer">
                    <p><i class="fas fa-lightbulb"></i> <strong>SEO Tip:</strong> Gebruik bij voorkeur één unieke H1 tag per pagina die de hoofdinhoud beschrijft.</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Sitewide Analysis Functions
let selectedSitewideUrl = '';
let currentSitewideResults = null;

function useSitewideUrl() {
    const mainUrl = document.getElementById('urlInput').value.trim();
    
    if (!mainUrl || mainUrl.toLowerCase() === 'demo') {
        showErrorMessage('Geen geldige URL gevonden', 'Voer eerst een URL in het bovenste veld in');
        return;
    }
    
    // Ensure URL has protocol
    let processedUrl = mainUrl;
    if (!processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
    }
    
    selectedSitewideUrl = processedUrl;
    
    // Update display
    const displayEl = document.getElementById('sitewideUrlDisplay');
    if (displayEl) {
        displayEl.textContent = processedUrl;
        displayEl.classList.remove('empty');
    }
    
    // Enable sitewide button
    const sitewideBtn = document.getElementById('startSitewideBtn');
    if (sitewideBtn) {
        sitewideBtn.disabled = false;
    }
    
    // Show success notification
    analysisStorage.showSaveNotification('URL geselecteerd voor sitewide analyse!');
}

async function startSitewideAnalysis() {
    if (!selectedSitewideUrl) {
        showErrorMessage('Geen URL geselecteerd', 'Klik eerst op "Gebruik URL hierboven"');
        return;
    }
    
    const keyword = document.getElementById('keywordInput').value.trim();
    const maxPages = parseInt(document.getElementById('maxPages').value);
    const includeSubdomains = document.getElementById('includeSubdomains')?.checked;
    
    try {
        // Update UI methods in SitewideAnalyzer
        sitewideAnalyzer.showSitewideProgress = showSitewideProgress;
        sitewideAnalyzer.updateSitewideProgress = updateSitewideProgress;
        sitewideAnalyzer.hideSitewideProgress = hideSitewideProgress;
        sitewideAnalyzer.displaySitewideResults = displaySitewideResults;
        sitewideAnalyzer.showSitewideError = showSitewideError;
        
        const results = await sitewideAnalyzer.analyzeSitewide(selectedSitewideUrl, keyword, {
            maxPages,
            includeSubdomains
        });
        
        currentSitewideResults = results;
        
    } catch (error) {
        console.error('Sitewide analysis failed:', error);
        showSitewideError(`Sitewide analyse fout: ${error.message}`);
    }
}

function showSitewideProgress() {
    const progressEl = document.getElementById('sitewideProgress');
    const resultsEl = document.getElementById('sitewideResults');
    if (progressEl) progressEl.style.display = 'block';
    if (resultsEl) resultsEl.style.display = 'none';
}

function updateSitewideProgress(percent, status) {
    const fill = document.getElementById('sitewideProgressFill');
    const statusEl = document.getElementById('sitewideStatus');
    const countEl = document.getElementById('sitewideCount');
    
    if (fill) fill.style.width = percent + '%';
    if (statusEl) statusEl.textContent = status;
    if (countEl) {
        const analyzedCount = sitewideAnalyzer.analyzedPages.length;
        countEl.textContent = `${analyzedCount} pagina's geanalyseerd`;
    }
}

function hideSitewideProgress() {
    const progressEl = document.getElementById('sitewideProgress');
    if (progressEl) progressEl.style.display = 'none';
}

function displaySitewideResults(results) {
    const resultsEl = document.getElementById('sitewideResults');
    if (resultsEl) resultsEl.style.display = 'block';
    
    // Store results globally for issue details
    currentSitewideResults = results;
    
    // Update overview stats
    updateSitewideOverview(results);
    
    // Display issues and pages list
    displaySitewideIssues(results.issues);
    displaySitewidePagesList(results.pages);
    displaySitewideTable(results.pages);
    
    console.log('Sitewide results ready:', results);
    analysisStorage.showSaveNotification('Sitewide analyse voltooid!');
}

function updateSitewideOverview(results) {
    const avgScoreEl = document.getElementById('sitewideAvgScore');
    const pageCountEl = document.getElementById('sitewidePageCount');
    const issueCountEl = document.getElementById('sitewideIssueCount');
    const recommendationCountEl = document.getElementById('sitewideRecommendationCount');
    
    if (avgScoreEl) avgScoreEl.textContent = results.averageScore + '%';
    if (pageCountEl) pageCountEl.textContent = results.successfulPages + '/' + results.totalPages;
    if (issueCountEl) issueCountEl.textContent = results.issues.length;
    if (recommendationCountEl) recommendationCountEl.textContent = results.recommendations.length;
}

function displaySitewideIssues(issues) {
    const container = document.getElementById('sitewideTopIssues');
    if (!container) return;
    
    if (issues.length === 0) {
        container.innerHTML = '<div class="no-issues"><i class="fas fa-check-circle"></i> Geen grote issues gevonden!</div>';
        return;
    }
    
    // Clear container first
    container.innerHTML = '';
    
    // Create each issue item with proper event handling
    issues.forEach((issue, index) => {
        const issueElement = document.createElement('div');
        issueElement.className = `sitewide-issue-item ${issue.type} clickable`;
        issueElement.style.cursor = 'pointer';
        issueElement.innerHTML = `
            <div class="issue-info">
                <div class="issue-message">
                    <i class="fas ${issue.type === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle'}"></i>
                    ${issue.message}
                </div>
                <div class="issue-count">${issue.count} pagina${issue.count > 1 ? '\'s' : ''}</div>
            </div>
            <div class="issue-arrow">
                <i class="fas fa-chevron-right"></i>
            </div>
        `;
        
        // Add click event listener
        issueElement.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔥 CLICK DETECTED! Issue clicked:', index, issue.message);
            showIssueDetails(index);
        });
        
        // Add to container
        container.appendChild(issueElement);
    });
}

function displaySitewidePagesList(pages) {
    const container = document.getElementById('sitewidePagesList');
    if (!container) return;
    
    if (!pages || pages.length === 0) {
        container.innerHTML = '<div class="no-pages">Geen pagina\'s geanalyseerd.</div>';
        return;
    }
    
    // Show first 10 pages with click functionality
    const displayPages = pages.slice(0, 10);
    
    container.innerHTML = displayPages.map((page, index) => `
        <div class="sitewide-page-item clickable" onclick="showPageContentModal('${page.url}', ${page.score})">
            <div class="page-info">
                <div class="page-url">
                    <i class="fas fa-file-alt"></i>
                    <span>${getShortUrl(page.url)}</span>
                </div>
                <div class="page-score ${getScoreClass(page.score)}">${page.score}%</div>
            </div>
            <div class="page-arrow">
                <i class="fas fa-chevron-right"></i>
            </div>
        </div>
    `).join('') + (pages.length > 10 ? `
        <div class="more-pages">
            <span>+${pages.length - 10} meer pagina's in de tabel hieronder</span>
        </div>
    ` : '');
}

function getScoreClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'warning';
    return 'poor';
}

// Display sitewide table with page details
function displaySitewideTable(pages) {
    const tableBody = document.getElementById('sitewideTableBody');
    if (!tableBody) return;
    
    if (!pages || pages.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="no-data">Geen pagina\'s geanalyseerd.</td></tr>';
        return;
    }
    
    tableBody.innerHTML = pages.map(page => {
        const shortUrl = getShortUrl(page.url);
        
        // Debug: log complete page data structure
        console.log('=== PAGE DATA DEBUG ===');
        console.log('URL:', page.url);
        console.log('Direct fields:', { title: page.title, h1: page.h1, metaDescription: page.metaDescription });
        console.log('Results object:', page.results);
        console.log('Results.title:', page.results?.title);
        console.log('Results.h1:', page.results?.h1);
        console.log('Results.meta:', page.results?.meta);
        console.log('========================');
        
        // Extract data with comprehensive fallbacks
        let title = page.title;
        if (!title || title === 'Geen title') {
            title = page.results?.title?.content || 'Geen title';
        }
        
        let h1 = page.h1;
        if (!h1 || h1 === 'Geen H1') {
            // Try multiple fallback paths
            h1 = page.results?.h1?.texts?.[0] || 
                 page.results?.h1?.content || 
                 (page.results?.h1?.texts?.length > 0 ? page.results.h1.texts[0] : null) ||
                 'Geen H1';
        }
        
        let metaDesc = page.metaDescription;
        if (!metaDesc || metaDesc === 'Geen meta description') {
            metaDesc = page.results?.meta?.content || 
                      page.results?.metaDescription?.content ||
                      'Geen meta description';
        }
        const issueCount = page.issues ? page.issues.length : 0;
        
        return `
            <tr class="page-row clickable-row" data-url="${page.url}" onclick="showPageContentModal('${page.url}', ${page.score})" title="Klik om pagina te optimaliseren">
                <td class="url-cell">
                    <div class="url-content">
                        <i class="fas fa-link"></i>
                        <a href="${page.url}" target="_blank" title="${page.url}" onclick="event.stopPropagation()">${shortUrl}</a>
                    </div>
                </td>
                <td class="score-cell">
                    <span class="score-badge ${getScoreClass(page.score)}">${page.score}%</span>
                </td>
                <td class="title-cell" title="${title}">
                    ${title.length > 50 ? title.substring(0, 50) + '...' : title}
                </td>
                <td class="h1-cell" title="${h1}">
                    ${h1.length > 40 ? h1.substring(0, 40) + '...' : h1}
                </td>
                <td class="meta-cell" title="${metaDesc}">
                    ${metaDesc.length > 60 ? metaDesc.substring(0, 60) + '...' : metaDesc}
                </td>
                <td class="issues-cell">
                    <span class="issue-count ${issueCount > 0 ? 'has-issues' : 'no-issues'}">
                        ${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function showSitewideError(message) {
    showErrorMessage('Sitewide Analyse Fout', message);
}

// Test function to check if JavaScript is working
function testIssueClick() {
    alert('JavaScript werkt! Issue click test succesvol.');
    console.log('Test function called successfully');
}

// Test modal function
function testModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 8px; color: black;">
            <h3>Test Modal</h3>
            <p>Als je dit ziet, werkt het modal systeem!</p>
            <button onclick="this.closest('div').parentElement.remove()">Sluiten</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// Global function to test issue details
window.testShowIssueDetails = function(index = 0) {
    console.log('Testing showIssueDetails with index:', index);
    showIssueDetails(index);
};

function showIssueDetails(issueIndex) {
    console.log('showIssueDetails called with index:', issueIndex);
    console.log('currentSitewideResults:', currentSitewideResults);
    
    if (!currentSitewideResults) {
        showErrorMessage('Geen resultaten', 'Voer eerst een sitewide analyse uit');
        return;
    }
    
    if (!currentSitewideResults.issues || !currentSitewideResults.issues[issueIndex]) {
        showErrorMessage('Issue niet gevonden', `Issue ${issueIndex} bestaat niet. Totaal issues: ${currentSitewideResults.issues?.length || 0}`);
        return;
    }
    
    const issue = currentSitewideResults.issues[issueIndex];
    
    // Use same modal style as existing popups
    const modal = document.createElement('div');
    modal.className = 'alt-text-modal'; // Reuse existing modal styles
    modal.innerHTML = `
        <div class="alt-text-modal-content">
            <div class="alt-text-header">
                <h3>
                    <i class="fas ${issue.type === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle'}" style="color: ${issue.type === 'error' ? '#ef4444' : '#f59e0b'};"></i> 
                    ${issue.message}
                </h3>
                <button onclick="this.closest('.alt-text-modal').remove()" class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="alt-text-body">
                <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px; padding: 16px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
                    <div style="text-align: center;">
                        <div style="font-size: 2rem; font-weight: bold; color: white;">${issue.count}</div>
                        <div style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.7);">Pagina${issue.count > 1 ? '\'s' : ''} getroffen</div>
                    </div>
                    <div style="padding: 8px 16px; border-radius: 20px; background: rgba(${issue.type === 'error' ? '239, 68, 68' : '245, 158, 11'}, 0.2); color: ${issue.type === 'error' ? '#ef4444' : '#f59e0b'}; font-weight: 600;">
                        <i class="fas ${issue.type === 'error' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle'}"></i>
                        ${issue.type === 'error' ? 'Kritiek' : 'Waarschuwing'}
                    </div>
                </div>
                
                <p><strong><i class="fas fa-info-circle"></i> Wat betekent dit?</strong></p>
                <p style="margin-bottom: 20px; color: rgba(255, 255, 255, 0.9);">${getIssueDescription(issue.message)}</p>
                
                <p><strong><i class="fas fa-list"></i> Getroffen pagina's (${issue.pages.length}):</strong></p>
                <div class="missing-images-list">
                    ${issue.pages.map((url, index) => `
                        <div class="missing-image-item">
                            <div class="image-info">
                                <i class="fas fa-link" style="color: #60a5fa;"></i>
                                <div class="image-details">
                                    <div class="image-filename">
                                        <a href="${url}" target="_blank" style="color: #60a5fa; text-decoration: none;">${getShortUrl(url)}</a>
                                    </div>
                                    <div class="image-path" style="font-size: 0.8rem; opacity: 0.7;">${url}</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button onclick="analyzeSinglePage('${url}')" class="copy-btn" title="Analyseer deze pagina" style="background: rgba(34, 197, 94, 0.2); color: #22c55e;">
                                    <i class="fas fa-search"></i>
                                </button>
                                <button onclick="copyToClipboard('${url}')" class="copy-btn" title="Kopieer URL">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="alt-text-footer">
                    <p><i class="fas fa-lightbulb"></i> <strong>Hoe op te lossen:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px; color: rgba(255, 255, 255, 0.9);">
                        ${getIssueRecommendations(issue.message).map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function getIssueDescription(issueMessage) {
    const descriptions = {
        'Title tag ontbreekt': 'De title tag is een van de belangrijkste SEO elementen. Het verschijnt in zoekresultaten en browser tabs. Zonder title tag kunnen zoekmachines je pagina niet goed indexeren.',
        'Title lengte niet optimaal': 'Title tags moeten tussen 30-60 karakters lang zijn. Te kort en je mist kansen voor keywords, te lang en ze worden afgeknipt in zoekresultaten.',
        'H1 tag ontbreekt': 'Elke pagina moet precies één H1 tag hebben die de hoofdinhoud beschrijft. Dit helpt zoekmachines begrijpen waar je pagina over gaat.',
        'Meerdere H1 tags': 'Een pagina mag maar één H1 tag hebben. Meerdere H1 tags verwarren zoekmachines over de hoofdinhoud van je pagina.',
        'Meta description ontbreekt': 'Meta descriptions verschijnen onder je titel in zoekresultaten. Ze beïnvloeden de click-through rate en geven gebruikers een preview van je content.',
    };
    
    // Check for partial matches
    for (const [key, desc] of Object.entries(descriptions)) {
        if (issueMessage.includes(key)) {
            return desc;
        }
    }
    
    return 'Dit is een SEO issue dat aandacht vereist. Bekijk de aanbevelingen hieronder voor specifieke oplossingen.';
}

function getIssueRecommendations(issueMessage) {
    const recommendations = {
        'Title tag ontbreekt': [
            'Voeg een <title> tag toe in de <head> sectie van elke pagina',
            'Gebruik unieke, beschrijvende titles voor elke pagina',
            'Plaats belangrijke keywords aan het begin van de title'
        ],
        'Title lengte niet optimaal': [
            'Houd titles tussen 30-60 karakters lang',
            'Gebruik de belangrijkste keywords vooraan',
            'Maak elke title uniek en beschrijvend'
        ],
        'H1 tag ontbreekt': [
            'Voeg één H1 tag toe per pagina',
            'Gebruik de H1 om de hoofdinhoud te beschrijven',
            'Plaats relevante keywords in de H1'
        ],
        'Meerdere H1 tags': [
            'Gebruik slechts één H1 per pagina',
            'Verander extra H1 tags naar H2, H3, etc.',
            'Zorg dat de H1 de belangrijkste heading is'
        ],
        'Meta description ontbreekt': [
            'Voeg een meta description toe van 150-160 karakters',
            'Maak het aantrekkelijk en actionable',
            'Gebruik relevante keywords natuurlijk'
        ],
    };
    
    // Check for partial matches
    for (const [key, recs] of Object.entries(recommendations)) {
        if (issueMessage.includes(key)) {
            return recs;
        }
    }
    
    return ['Bekijk SEO best practices voor dit specifieke probleem', 'Test wijzigingen met SEO tools', 'Monitor resultaten na implementatie'];
}

function analyzeSinglePage(url) {
    // Set URL and analyze
    document.getElementById('urlInput').value = url;
    analyzeWebsite();
    
    // Close modal
    document.querySelector('.alt-text-modal')?.remove();
    
    // Scroll to results
    setTimeout(() => {
        document.getElementById('resultsSection')?.scrollIntoView({ behavior: 'smooth' });
    }, 500);
}

// Helper function for URL display
function getShortUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname + urlObj.search;
    } catch {
        return url;
    }
}

// Show page content modal with AI SEO optimization
async function showPageContentModal(url, score) {
    console.log('Opening page content modal for:', url);
    
    // Create modal with loading state
    const modal = document.createElement('div');
    modal.className = 'page-content-modal';
    modal.innerHTML = `
        <div class="page-content-modal-content">
            <div class="page-content-header">
                <div class="page-content-title">
                    <h3><i class="fas fa-file-alt"></i> Pagina Content Optimalisatie</h3>
                    <div class="page-url-info">
                        <span class="page-url">${url}</span>
                        <span class="page-score ${getScoreClass(score)}">SEO Score: ${score}%</span>
                    </div>
                </div>
                <button onclick="this.closest('.page-content-modal').remove()" class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="page-content-body">
                <div class="content-columns">
                    <div class="content-column original">
                        <div class="column-header">
                            <h4><i class="fas fa-code"></i> Huidige Content</h4>
                            <button onclick="refreshPageContent('${url}')" class="refresh-btn">
                                <i class="fas fa-sync-alt"></i> Ververs
                            </button>
                        </div>
                        <div class="content-area">
                            <div class="loading-content">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Content laden...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="content-column optimized">
                        <div class="column-header">
                            <h4><i class="fas fa-magic"></i> AI SEO Optimalisatie</h4>
                            <button onclick="generateSEOContent('${url}')" class="generate-btn">
                                <i class="fas fa-robot"></i> Genereer
                            </button>
                        </div>
                        <div class="content-area">
                            <div class="placeholder-content">
                                <i class="fas fa-lightbulb"></i>
                                <p>Klik "Genereer" voor AI-geoptimaliseerde content</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="page-issues-section">
                    <div class="issues-header">
                        <h4><i class="fas fa-exclamation-triangle"></i> Pagina Issues</h4>
                    </div>
                    <div class="issues-content" id="pageIssuesContent">
                        <div class="loading-issues">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Issues laden...</p>
                        </div>
                    </div>
                </div>
                
                <div class="content-actions">
                    <button onclick="copyOptimizedContent()" class="action-btn primary">
                        <i class="fas fa-copy"></i> Kopieer Geoptimaliseerde Content
                    </button>
                    <button onclick="downloadContentComparison()" class="action-btn secondary">
                        <i class="fas fa-download"></i> Download Vergelijking
                    </button>
                    <button onclick="analyzeSinglePage('${url}')" class="action-btn secondary">
                        <i class="fas fa-search"></i> Analyseer Pagina
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Load page content and issues
    loadPageContent(url);
    loadPageIssues(url);
}

// Load and display page issues
function loadPageIssues(url) {
    const issuesContent = document.getElementById('pageIssuesContent');
    if (!issuesContent) return;
    
    // Find page data in sitewide results
    if (!currentSitewideResults || !currentSitewideResults.pages) {
        issuesContent.innerHTML = `
            <div class="no-issues">
                <i class="fas fa-info-circle"></i>
                <p>Geen sitewide data beschikbaar. Voer eerst een sitewide analyse uit.</p>
            </div>
        `;
        return;
    }
    
    const pageData = currentSitewideResults.pages.find(page => page.url === url);
    if (!pageData || !pageData.issues || pageData.issues.length === 0) {
        issuesContent.innerHTML = `
            <div class="no-issues success">
                <i class="fas fa-check-circle"></i>
                <p>Geen issues gevonden op deze pagina!</p>
            </div>
        `;
        return;
    }
    
    // Display issues
    issuesContent.innerHTML = `
        <div class="issues-list">
            ${pageData.issues.map((issue, index) => `
                <div class="issue-item ${issue.type}">
                    <div class="issue-header">
                        <i class="fas ${issue.type === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle'}"></i>
                        <span class="issue-message">${issue.message}</span>
                        <span class="issue-type-badge ${issue.type}">${issue.type === 'error' ? 'Kritiek' : 'Waarschuwing'}</span>
                    </div>
                    <div class="issue-description">
                        ${getIssueDescription(issue.message)}
                    </div>
                    <div class="issue-recommendations">
                        <strong>Oplossing:</strong>
                        <ul>
                            ${getIssueRecommendations(issue.message).map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="issues-summary">
            <div class="summary-stats">
                <span class="stat-item error">
                    <i class="fas fa-times-circle"></i>
                    ${pageData.issues.filter(i => i.type === 'error').length} Kritieke issues
                </span>
                <span class="stat-item warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${pageData.issues.filter(i => i.type === 'warning').length} Waarschuwingen
                </span>
            </div>
        </div>
    `;
}

// Get issue description based on message
function getIssueDescription(message) {
    const descriptions = {
        'Title tag ontbreekt': 'De title tag is essentieel voor SEO en wordt getoond in zoekresultaten. Zonder title tag kunnen zoekmachines je pagina niet goed indexeren.',
        'Title lengte niet optimaal': 'De ideale lengte voor een title tag is 50-60 karakters. Te korte titles missen kansen, te lange worden afgekort in zoekresultaten.',
        'H1 tag ontbreekt': 'De H1 tag geeft de hoofdstructuur van je pagina aan en helpt zoekmachines de inhoud te begrijpen.',
        'Meerdere H1 tags': 'Er mag maar één H1 tag per pagina zijn voor optimale SEO structuur.',
        'Meta description ontbreekt': 'Meta descriptions worden getoond in zoekresultaten en beïnvloeden de click-through rate.',
        'Meta description te kort': 'Meta descriptions van minder dan 120 karakters benutten niet de volledige ruimte in zoekresultaten.',
        'Meta description te lang': 'Meta descriptions langer dan 160 karakters worden afgekort in zoekresultaten.'
    };
    
    return descriptions[message] || 'Dit issue kan de SEO prestaties van je pagina beïnvloeden.';
}

// Get issue recommendations based on message
function getIssueRecommendations(message) {
    const recommendations = {
        'Title tag ontbreekt': [
            'Voeg een <title> tag toe in de <head> sectie',
            'Gebruik relevante keywords in de title',
            'Houd de title tussen 50-60 karakters'
        ],
        'Title lengte niet optimaal': [
            'Pas de title aan naar 50-60 karakters',
            'Gebruik krachtige, beschrijvende woorden',
            'Plaats belangrijke keywords vooraan'
        ],
        'H1 tag ontbreekt': [
            'Voeg een <h1> tag toe aan je pagina',
            'Gebruik de H1 voor de hoofdtitel van je content',
            'Integreer relevante keywords natuurlijk'
        ],
        'Meerdere H1 tags': [
            'Gebruik slechts één H1 tag per pagina',
            'Vervang extra H1 tags door H2, H3, etc.',
            'Behoud hiërarchische structuur'
        ],
        'Meta description ontbreekt': [
            'Voeg een meta description tag toe',
            'Schrijf een aantrekkelijke samenvatting van 140-160 karakters',
            'Gebruik een call-to-action'
        ],
        'Meta description te kort': [
            'Breid de meta description uit naar 140-160 karakters',
            'Voeg meer details over je content toe',
            'Gebruik emotionele triggers'
        ],
        'Meta description te lang': [
            'Kort de meta description in tot maximaal 160 karakters',
            'Focus op de belangrijkste informatie',
            'Behoud de call-to-action'
        ]
    };
    
    return recommendations[message] || [
        'Analyseer het specifieke probleem',
        'Implementeer best practices voor SEO',
        'Test de wijzigingen na implementatie'
    ];
}

// Load and display page content with multiple fallback methods
async function loadPageContent(url) {
    const contentArea = document.querySelector('.content-column.original .content-area');
    if (!contentArea) return;
    
    // Try multiple methods to fetch content
    const methods = [
        () => fetchWithCORSProxy(url, 'https://api.allorigins.win/raw?url='),
        () => fetchWithCORSProxy(url, 'https://cors-anywhere.herokuapp.com/'),
        () => fetchWithCORSProxy(url, 'https://thingproxy.freeboard.io/fetch/'),
        () => fetchDirectly(url),
        () => generateMockContent(url)
    ];
    
    for (let i = 0; i < methods.length; i++) {
        try {
            console.log(`Trying method ${i + 1} for ${url}`);
            const content = await methods[i]();
            if (content) {
                displayPageContent(contentArea, content, url);
                return;
            }
        } catch (error) {
            console.log(`Method ${i + 1} failed:`, error.message);
            if (i === methods.length - 1) {
                // Last method failed, show error with manual input option
                showContentError(contentArea, url, error);
            }
        }
    }
}

// Fetch with CORS proxy
async function fetchWithCORSProxy(url, proxyUrl) {
    const response = await fetch(`${proxyUrl}${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    return extractContentFromDOM(doc);
}

// Try direct fetch (will fail due to CORS but worth trying)
async function fetchDirectly(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    return extractContentFromDOM(doc);
}

// Generate mock content based on URL analysis
function generateMockContent(url) {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
    
    // Generate realistic content based on URL structure
    const title = pathParts.length > 0 
        ? `${pathParts[pathParts.length - 1].replace(/-/g, ' ')} | ${domain}`
        : `Welkom bij ${domain}`;
    
    const metaDesc = `Ontdek ${pathParts.join(', ')} bij ${domain}. Professionele oplossingen en diensten voor al uw behoeften.`;
    
    const h1 = pathParts.length > 0 
        ? pathParts[pathParts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : `Welkom bij ${domain}`;
    
    return {
        title,
        metaDesc,
        h1,
        h2s: [`Over ${h1}`, `Waarom kiezen voor ${domain}`, 'Contact & Informatie'],
        paragraphs: [
            `${domain} biedt professionele oplossingen voor ${pathParts.join(', ')}.`,
            `Met jarenlange ervaring helpen wij u met al uw behoeften op het gebied van ${h1.toLowerCase()}.`,
            `Neem contact op voor meer informatie over onze diensten en mogelijkheden.`
        ],
        isGenerated: true
    };
}

// Extract content from DOM
function extractContentFromDOM(doc) {
    const title = doc.querySelector('title')?.textContent || 'Geen title gevonden';
    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 'Geen meta description gevonden';
    const h1 = doc.querySelector('h1')?.textContent || 'Geen H1 gevonden';
    const h2s = Array.from(doc.querySelectorAll('h2')).map(h => h.textContent.trim()).filter(h => h.length > 0).slice(0, 5);
    
    // Extract main content (paragraphs)
    const paragraphs = Array.from(doc.querySelectorAll('p'))
        .map(p => p.textContent.trim())
        .filter(text => text.length > 50)
        .slice(0, 5);
    
    return { title, metaDesc, h1, h2s, paragraphs, isGenerated: false };
}

// Display page content
function displayPageContent(contentArea, content, url) {
    const generatedNotice = content.isGenerated ? `
        <div class="generated-notice">
            <i class="fas fa-info-circle"></i>
            <p><strong>Gegenereerde Content</strong> - Kon pagina niet laden, content is gegenereerd op basis van URL analyse</p>
            <button onclick="manualContentInput('${url}')" class="manual-input-btn">
                <i class="fas fa-edit"></i> Handmatig Invoeren
            </button>
        </div>
    ` : '';
    
    contentArea.innerHTML = `
        ${generatedNotice}
        
        <div class="content-section">
            <h5><i class="fas fa-heading"></i> Title Tag</h5>
            <div class="content-item">${content.title}</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-paragraph"></i> Meta Description</h5>
            <div class="content-item">${content.metaDesc}</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-header"></i> H1 Tag</h5>
            <div class="content-item">${content.h1}</div>
        </div>
        
        ${content.h2s && content.h2s.length > 0 ? `
        <div class="content-section">
            <h5><i class="fas fa-list"></i> H2 Tags</h5>
            ${content.h2s.map(h2 => `<div class="content-item">${h2}</div>`).join('')}
        </div>
        ` : ''}
        
        ${content.paragraphs && content.paragraphs.length > 0 ? `
        <div class="content-section">
            <h5><i class="fas fa-align-left"></i> Hoofdcontent</h5>
            ${content.paragraphs.map(p => `<div class="content-item">${p.substring(0, 200)}${p.length > 200 ? '...' : ''}</div>`).join('')}
        </div>
        ` : ''}
    `;
}

// Show content error with manual input option
function showContentError(contentArea, url, error) {
    contentArea.innerHTML = `
        <div class="error-content">
            <i class="fas fa-exclamation-triangle"></i>
            <p><strong>Kon pagina content niet laden</strong></p>
            <p class="error-details">Reden: CORS blokkering door website</p>
            
            <div class="error-solutions">
                <button onclick="manualContentInput('${url}')" class="solution-btn primary">
                    <i class="fas fa-edit"></i> Handmatig Invoeren
                </button>
                <button onclick="openPageInNewTab('${url}')" class="solution-btn secondary">
                    <i class="fas fa-external-link-alt"></i> Pagina Openen
                </button>
                <button onclick="loadPageContent('${url}')" class="solution-btn secondary">
                    <i class="fas fa-redo"></i> Opnieuw Proberen
                </button>
            </div>
            
            <div class="error-help">
                <p><strong>💡 Tip:</strong> Kopieer de title, meta description en H1 van de pagina en plak ze handmatig in.</p>
            </div>
        </div>
    `;
}

// Manual content input
function manualContentInput(url) {
    const title = prompt('Voer de title tag in van de pagina:');
    if (!title) return;
    
    const metaDesc = prompt('Voer de meta description in:');
    const h1 = prompt('Voer de H1 tag in:');
    
    const content = {
        title: title || 'Handmatig ingevoerde title',
        metaDesc: metaDesc || 'Handmatig ingevoerde meta description',
        h1: h1 || 'Handmatig ingevoerde H1',
        h2s: [],
        paragraphs: [],
        isGenerated: false
    };
    
    const contentArea = document.querySelector('.content-column.original .content-area');
    if (contentArea) {
        displayPageContent(contentArea, content, url);
        analysisStorage.showSaveNotification('Content handmatig ingevoerd!');
    }
}

// Open page in new tab
function openPageInNewTab(url) {
    window.open(url, '_blank');
}

// Generate AI-optimized SEO content with real AI integration
async function generateSEOContent(url) {
    const contentArea = document.querySelector('.content-column.optimized .content-area');
    if (!contentArea) return;
    
    contentArea.innerHTML = `
        <div class="generating-content">
            <i class="fas fa-spinner fa-spin"></i>
            <p>AI content wordt gegenereerd...</p>
        </div>
    `;
    
    try {
        // Get original content from the left column
        const originalContent = extractOriginalContent();
        
        // Check if API key is configured
        const apiKey = getAIApiKey();
        if (!apiKey) {
            showAIConfigurationPrompt(contentArea);
            return;
        }
        
        // Generate optimized content with AI
        const optimizedContent = await generateWithAI(originalContent, url, apiKey);
        
        // Display the AI-generated content
        displayOptimizedContent(contentArea, optimizedContent);
        
    } catch (error) {
        console.error('AI generation error:', error);
        contentArea.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Fout bij AI generatie: ${error.message}</p>
                <button onclick="generateSEOContent('${url}')" class="retry-btn">
                    <i class="fas fa-redo"></i> Probeer opnieuw
                </button>
            </div>
        `;
    }
}

// Extract original content from the left column
function extractOriginalContent() {
    const originalColumn = document.querySelector('.content-column.original .content-area');
    if (!originalColumn) return {};
    
    const titleElement = originalColumn.querySelector('.content-section:nth-child(1) .content-item');
    const metaElement = originalColumn.querySelector('.content-section:nth-child(2) .content-item');
    const h1Element = originalColumn.querySelector('.content-section:nth-child(3) .content-item');
    
    // Extract H2 tags - find section with H2 in title
    const h2Section = Array.from(originalColumn.querySelectorAll('.content-section')).find(section => {
        const h5 = section.querySelector('h5');
        return h5 && h5.textContent.includes('H2');
    });
    const h2s = h2Section ? Array.from(h2Section.querySelectorAll('.content-item')).map(el => el.textContent || '') : [];
    
    // Extract main content paragraphs - find section with Hoofdcontent in title
    const contentSection = Array.from(originalColumn.querySelectorAll('.content-section')).find(section => {
        const h5 = section.querySelector('h5');
        return h5 && h5.textContent.includes('Hoofdcontent');
    });
    const paragraphs = contentSection ? Array.from(contentSection.querySelectorAll('.content-item')).map(el => el.textContent || '') : [];
    
    return {
        title: titleElement?.textContent || '',
        metaDesc: metaElement?.textContent || '',
        h1: h1Element?.textContent || '',
        h2s: h2s,
        paragraphs: paragraphs
    };
}

// Get AI API key from localStorage or prompt user
function getAIApiKey() {
    // Check which AI provider is selected
    const aiProvider = localStorage.getItem('seomax_ai_provider') || 'free';
    
    if (aiProvider === 'free') {
        return 'FREE_HUGGINGFACE'; // Use free Hugging Face
    }
    
    let apiKey = localStorage.getItem('seomax_openai_key');
    
    if (!apiKey) {
        apiKey = prompt('Voer je OpenAI API key in voor AI content generatie:\n\nJe kunt een key krijgen op: https://platform.openai.com/api-keys');
        if (apiKey) {
            localStorage.setItem('seomax_openai_key', apiKey);
        }
    }
    
    return apiKey;
}

// Show AI configuration prompt
function showAIConfigurationPrompt(contentArea) {
    contentArea.innerHTML = `
        <div class="ai-config-prompt">
            <i class="fas fa-robot"></i>
            <h4>AI Content Generatie</h4>
            <p>Kies je AI provider voor SEO content optimalisatie:</p>
            
            <div class="ai-provider-options">
                <div class="provider-option free" onclick="selectAIProvider('free')">
                    <div class="provider-header">
                        <i class="fas fa-gift"></i>
                        <h5>Gratis AI</h5>
                        <span class="provider-badge free">GRATIS</span>
                    </div>
                    <p>Hugging Face AI - Geen kosten, geen registratie</p>
                    <ul>
                        <li>✅ Volledig gratis</li>
                        <li>✅ Geen API key nodig</li>
                        <li>✅ Direct gebruiken</li>
                        <li>⚠️ Beperkte kwaliteit</li>
                    </ul>
                </div>
                
                <div class="provider-option premium" onclick="selectAIProvider('openai')">
                    <div class="provider-header">
                        <i class="fas fa-crown"></i>
                        <h5>OpenAI GPT</h5>
                        <span class="provider-badge premium">PREMIUM</span>
                    </div>
                    <p>Beste kwaliteit AI voor professioneel gebruik</p>
                    <ul>
                        <li>🚀 Hoogste kwaliteit</li>
                        <li>🎯 SEO geoptimaliseerd</li>
                        <li>🇳🇱 Perfect Nederlands</li>
                        <li>💰 ~€0.01 per optimalisatie</li>
                    </ul>
                </div>
            </div>
            
            <div class="config-actions">
                <button onclick="showAIDemo()" class="config-btn secondary">
                    <i class="fas fa-eye"></i> Demo Bekijken
                </button>
            </div>
        </div>
    `;
}

// Select AI provider
function selectAIProvider(provider) {
    localStorage.setItem('seomax_ai_provider', provider);
    
    if (provider === 'free') {
        analysisStorage.showSaveNotification('Gratis AI geselecteerd! Klik "Genereer" om te beginnen.');
        // Close the modal and show placeholder for immediate use
        const modal = document.querySelector('.page-content-modal');
        if (modal) modal.remove();
    } else if (provider === 'openai') {
        configureAIKey();
    }
}

// Configure AI API key
function configureAIKey() {
    const apiKey = prompt('Voer je OpenAI API key in:\n\n(Deze wordt lokaal opgeslagen in je browser)');
    if (apiKey) {
        localStorage.setItem('seomax_openai_key', apiKey);
        localStorage.setItem('seomax_ai_provider', 'openai');
        analysisStorage.showSaveNotification('OpenAI API key opgeslagen! Probeer nu opnieuw te genereren.');
        
        // Close the modal
        const modal = document.querySelector('.page-content-modal');
        if (modal) modal.remove();
    }
}

// Show AI demo with placeholder content
function showAIDemo() {
    const contentArea = document.querySelector('.content-column.optimized .content-area');
    if (!contentArea) return;
    
    contentArea.innerHTML = `
        <div class="demo-notice">
            <i class="fas fa-info-circle"></i>
            <p><strong>Demo Modus</strong> - Voorbeeld van AI gegenereerde content</p>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde Title</h5>
            <div class="content-item optimized">SEO Geoptimaliseerde Title - Verbeterd voor Zoekmachines | Brand</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde Meta Description</h5>
            <div class="content-item optimized">Ontdek onze SEO-geoptimaliseerde content die perfect is afgestemd op zoekmachines. Verhoog je rankings met deze professionele aanpak. Klik hier voor meer info!</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde H1</h5>
            <div class="content-item optimized">SEO Geoptimaliseerde Hoofdtitel voor Betere Rankings</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-lightbulb"></i> SEO Aanbevelingen</h5>
            <div class="seo-recommendations">
                <div class="recommendation"><i class="fas fa-check"></i> Voeg meer relevante keywords toe</div>
                <div class="recommendation"><i class="fas fa-check"></i> Verbeter de leesbaarheid van content</div>
                <div class="recommendation"><i class="fas fa-check"></i> Optimaliseer afbeelding alt-teksten</div>
                <div class="recommendation"><i class="fas fa-check"></i> Voeg interne links toe</div>
            </div>
        </div>
    `;
}

// Generate content with AI (supports both free and premium)
async function generateWithAI(originalContent, url, apiKey) {
    const aiProvider = localStorage.getItem('seomax_ai_provider') || 'free';
    
    if (apiKey === 'FREE_HUGGINGFACE' || aiProvider === 'free') {
        return await generateWithHuggingFace(originalContent, url);
    } else {
        return await generateWithOpenAI(originalContent, url, apiKey);
    }
}

// Generate content with free Hugging Face API
async function generateWithHuggingFace(originalContent, url) {
    const prompt = `Optimaliseer deze SEO content:
Title: ${originalContent.title}
Meta: ${originalContent.metaDesc}
H1: ${originalContent.h1}

Maak betere versies voor SEO.`;

    try {
        // Use a free text generation model
        const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_length: 200,
                    temperature: 0.7
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            // Process the response and create optimized content
            return createOptimizedContentFromResponse(originalContent, data);
        }
    } catch (error) {
        console.log('Hugging Face API error, using smart fallback:', error);
    }
    
    // Smart fallback with basic SEO optimization
    return createSmartOptimizedContent(originalContent, url);
}

// Generate content with OpenAI API
async function generateWithOpenAI(originalContent, url, apiKey) {
    const prompt = `Je bent een SEO expert. Optimaliseer de volgende content voor betere zoekmachine rankings:

URL: ${url}
Huidige Title: "${originalContent.title}"
Huidige Meta Description: "${originalContent.metaDesc}"
Huidige H1: "${originalContent.h1}"

Genereer geoptimaliseerde versies die:
- SEO-vriendelijk zijn
- Aantrekkelijk voor gebruikers
- Relevante keywords bevatten
- Title: 30-60 karakters
- Meta description: 150-160 karakters
- H1: duidelijk en keyword-rijk

Geef ook 4 specifieke SEO aanbevelingen voor deze pagina.

Antwoord in dit JSON formaat:
{
  "title": "geoptimaliseerde title",
  "metaDescription": "geoptimaliseerde meta description",
  "h1": "geoptimaliseerde h1",
  "recommendations": ["aanbeveling 1", "aanbeveling 2", "aanbeveling 3", "aanbeveling 4"]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ 
                role: 'user', 
                content: prompt 
            }],
            temperature: 0.7,
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
        return JSON.parse(content);
    } catch (e) {
        // Fallback if JSON parsing fails
        return createSmartOptimizedContent(originalContent, url);
    }
}

// Create smart optimized content (free fallback)
function createSmartOptimizedContent(originalContent, url) {
    // Extract domain and keywords from URL
    const domain = new URL(url).hostname.replace('www.', '');
    const pathKeywords = new URL(url).pathname.split('/').filter(p => p.length > 2);
    
    // Advanced SEO optimization with content analysis
    const optimizedTitle = optimizeTitle(originalContent.title, domain, pathKeywords, originalContent);
    const optimizedMeta = optimizeMeta(originalContent.metaDesc, domain, pathKeywords, originalContent);
    const optimizedH1 = optimizeH1(originalContent.h1, pathKeywords, originalContent);
    
    // Optimize H2 tags
    const optimizedH2s = optimizeH2Tags(originalContent.h2s || [], pathKeywords, originalContent);
    
    // Optimize main content paragraphs
    const optimizedContent = optimizeMainContent(originalContent.paragraphs || [], pathKeywords, domain, originalContent);
    
    // Generate specific recommendations based on analysis
    const recommendations = generateSEORecommendations(originalContent, optimizedTitle, optimizedMeta, optimizedH1, pathKeywords, domain);
    
    return {
        title: optimizedTitle,
        metaDescription: optimizedMeta,
        h1: optimizedH1,
        h2s: optimizedH2s,
        content: optimizedContent,
        recommendations: recommendations
    };
}

// Advanced title optimization with content analysis
function optimizeTitle(title, domain, keywords, originalContent) {
    if (!title || title === 'Geen title gevonden') {
        return `SEO Geoptimaliseerde Pagina | ${domain}`;
    }
    
    // Analyze current title for improvements
    let optimized = title.trim();
    
    // Extract key terms from content for context
    const contentKeywords = extractKeywordsFromContent(originalContent);
    const urlKeywords = keywords.length > 0 ? keywords : [];
    const allKeywords = [...new Set([...contentKeywords, ...urlKeywords])];
    
    // Check if title needs improvement
    const improvements = [];
    
    // 1. Add power words if missing
    const powerWords = ['Expert', 'Gids', 'Complete', 'Beste', 'Professioneel', 'Premium', 'Ultieme'];
    const hasPowerWord = powerWords.some(word => optimized.toLowerCase().includes(word.toLowerCase()));
    
    // 2. Add year for freshness if content seems evergreen
    const currentYear = new Date().getFullYear();
    const hasYear = optimized.includes(currentYear.toString());
    
    // 3. Check for emotional triggers
    const emotionalWords = ['Ontdek', 'Leer', 'Verbeter', 'Verhoog', 'Optimaliseer'];
    const hasEmotional = emotionalWords.some(word => optimized.toLowerCase().includes(word.toLowerCase()));
    
    // Always apply improvements for better SEO
    const mainKeyword = allKeywords.length > 0 ? allKeywords[0].replace(/-/g, ' ') : '';
    
    // Add power word if missing
    if (!hasPowerWord && mainKeyword) {
        const powerWord = powerWords[Math.floor(Math.random() * powerWords.length)];
        optimized = `${powerWord} ${optimized}`;
    }
    
    // Add year for freshness
    if (!hasYear) {
        optimized = `${optimized} ${currentYear}`;
    }
    
    // Add emotional trigger if missing
    if (!hasEmotional) {
        optimized = `🚀 ${optimized}`;
    }
    
    // Add keyword context if missing
    if (mainKeyword && !optimized.toLowerCase().includes(mainKeyword.toLowerCase())) {
        optimized = `${optimized} - ${mainKeyword.charAt(0).toUpperCase() + mainKeyword.slice(1)} Specialist`;
    }
    
    // Ensure optimal length (50-60 chars is ideal)
    if (optimized.length > 60) {
        optimized = optimized.substring(0, 57) + '...';
    }
    
    return optimized;
}

// Advanced meta description optimization
function optimizeMeta(meta, domain, keywords, originalContent) {
    if (!meta || meta === 'Geen meta description gevonden') {
        const keywordText = keywords.length > 0 ? keywords.join(', ') : 'onze diensten';
        return `Ontdek ${keywordText} bij ${domain}. Professionele oplossingen voor al je behoeften. Neem contact op voor meer informatie.`;
    }
    
    let optimized = meta.trim();
    
    // Analyze if current meta is already good
    const hasCallToAction = /\b(klik|bezoek|ontdek|leer|vind|krijg|download|probeer|koop|bestel|neem contact|lees meer)\b/i.test(optimized);
    const hasNumbers = /\d+/.test(optimized);
    const hasEmotionalWords = /\b(snel|eenvoudig|gratis|beste|nieuw|exclusief|betrouwbaar|professioneel)\b/i.test(optimized);
    const isGoodLength = optimized.length >= 140 && optimized.length <= 160;
    
    // Always apply SEO improvements
    const contentKeywords = extractKeywordsFromContent(originalContent);
    const mainKeyword = keywords.length > 0 ? keywords[0].replace(/-/g, ' ') : '';
    
    // Add emotional triggers and benefits
    if (!hasEmotionalWords) {
        const emotionalTriggers = ['✅ Bewezen effectief', '🚀 Snel resultaat', '💪 Professioneel', '⭐ Beste keuze'];
        const trigger = emotionalTriggers[Math.floor(Math.random() * emotionalTriggers.length)];
        optimized = `${trigger}: ${optimized}`;
    }
    
    // Add keyword context if missing
    if (mainKeyword && !optimized.toLowerCase().includes(mainKeyword.toLowerCase())) {
        optimized = `${optimized} Specialist in ${mainKeyword}.`;
    }
    
    // Add call to action if missing
    if (!hasCallToAction) {
        const ctas = ['Ontdek meer →', 'Start vandaag!', 'Neem contact op!', 'Lees verder →'];
        const cta = ctas[Math.floor(Math.random() * ctas.length)];
        optimized = `${optimized} ${cta}`;
    }
    
    // Add numbers/stats for authority
    if (!hasNumbers && contentKeywords.length > 0) {
        optimized = `${optimized} 100% betrouwbaar.`;
    }
    
    // Ensure proper length (140-160 is ideal)
    if (optimized.length > 160) {
        optimized = optimized.substring(0, 157) + '...';
    } else if (optimized.length < 140) {
        optimized = `${optimized} Ervaar het verschil met ${domain}.`;
        if (optimized.length > 160) {
            optimized = optimized.substring(0, 157) + '...';
        }
    }
    
    return optimized;
}

// Advanced H1 optimization
function optimizeH1(h1, keywords, originalContent) {
    if (!h1 || h1 === 'Geen H1 gevonden') {
        const keyword = keywords.length > 0 ? keywords[0] : 'Welkom';
        return `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} - Professionele Oplossingen`;
    }
    
    let optimized = h1.trim();
    
    // Analyze if H1 is already good
    const hasKeyword = keywords.some(kw => optimized.toLowerCase().includes(kw.toLowerCase()));
    const isDescriptive = optimized.length > 20;
    const hasNumbers = /\d+/.test(optimized);
    const hasPowerWords = /\b(beste|complete|ultieme|expert|professioneel|gids|handleiding)\b/i.test(optimized);
    
    // Only improve if H1 is actually lacking
    let needsImprovement = false;
    
    // If H1 is very short and vague, improve it
    if (optimized.length < 15 && !isDescriptive) {
        const contentKeywords = extractKeywordsFromContent(originalContent);
        if (contentKeywords.length > 0) {
            optimized = `${contentKeywords[0].replace(/-/g, ' ')}: ${optimized}`;
            needsImprovement = true;
        }
    }
    
    // Return original if it's already good
    if (!needsImprovement) {
        return h1;
    }
    
    return optimized;
}

// Optimize H2 tags for better SEO structure
function optimizeH2Tags(h2s, keywords, originalContent) {
    if (!h2s || h2s.length === 0) {
        // Generate H2s based on keywords if none exist
        const keyword = keywords.length > 0 ? keywords[0].replace(/-/g, ' ') : 'onze diensten';
        return [
            `🔥 Waarom ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Zo Effectief Is`,
            `💪 De Voordelen van ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`,
            `🎯 Hoe ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Uw Resultaten Verbetert`
        ];
    }
    
    return h2s.map((h2, index) => {
        let optimized = h2.trim();
        const keyword = keywords.length > 0 ? keywords[0].replace(/-/g, ' ') : '';
        
        // Always apply SEO improvements to H2s
        const emojis = ['🔥', '💪', '🎯', '✨', '🚀', '⭐'];
        const emoji = emojis[index % emojis.length];
        
        if (keyword && !optimized.toLowerCase().includes(keyword.toLowerCase())) {
            // Add keyword context
            optimized = `${emoji} ${optimized} - ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Focus`;
        } else {
            // Just add engaging emoji and power words
            optimized = `${emoji} ${optimized}`;
        }
        
        return optimized;
    });
}

// Optimize main content paragraphs
function optimizeMainContent(paragraphs, keywords, domain, originalContent) {
    if (!paragraphs || paragraphs.length === 0) {
        // Generate basic content structure if none exists
        const keyword = keywords.length > 0 ? keywords[0].replace(/-/g, ' ') : 'onze diensten';
        return [
            `Welkom bij ${domain}, waar we gespecialiseerd zijn in ${keyword}. Onze expertise helpt u de beste resultaten te behalen.`,
            `Met jarenlange ervaring in ${keyword} bieden we professionele oplossingen die aansluiten bij uw specifieke behoeften.`,
            `Neem vandaag nog contact op om te ontdekken hoe ${domain} u kan helpen met ${keyword}.`
        ];
    }
    
    return paragraphs.map((paragraph, index) => {
        let optimized = paragraph.trim();
        const keyword = keywords.length > 0 ? keywords[0].replace(/-/g, ' ') : '';
        
        // Always apply SEO improvements
        if (keyword) {
            // Add keyword context and SEO improvements
            if (index === 0) {
                // First paragraph - add engaging hook
                optimized = `🎯 ${optimized} Deze aanpak is bewezen effectief voor ${keyword} en levert meetbare resultaten op.`;
            } else if (index === paragraphs.length - 1) {
                // Last paragraph - add call to action
                optimized = `${optimized} Ontdek vandaag nog hoe ${domain} uw ${keyword} doelen kan realiseren. Neem contact op voor een persoonlijk advies.`;
            } else {
                // Middle paragraphs - add authority and benefits
                optimized = `${optimized} Dit maakt het verschil in ${keyword} prestaties en zorgt voor langdurige resultaten.`;
            }
        } else {
            // Generic improvements without specific keywords
            if (index === 0) {
                optimized = `✨ ${optimized} Deze bewezen methode levert uitstekende resultaten op.`;
            } else {
                optimized = `${optimized} Dit zorgt voor optimale prestaties en duurzame resultaten.`;
            }
        }
        
        return optimized;
    });
}

// Extract keywords from content for better context
function extractKeywordsFromContent(originalContent) {
    const keywords = [];
    
    // Extract from title
    if (originalContent.title) {
        const titleWords = originalContent.title.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3 && !['voor', 'van', 'het', 'een', 'met', 'bij', 'over'].includes(word));
        keywords.push(...titleWords);
    }
    
    // Extract from meta description
    if (originalContent.metaDesc) {
        const metaWords = originalContent.metaDesc.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 4 && !['voor', 'van', 'het', 'een', 'met', 'bij', 'over', 'deze', 'zijn'].includes(word));
        keywords.push(...metaWords.slice(0, 3)); // Top 3 words
    }
    
    return [...new Set(keywords)].slice(0, 5); // Unique, max 5
}

// Generate contextual benefit based on keyword
function generateBenefitFromKeyword(keyword) {
    const benefits = {
        'supplement': 'Verhoog je energie en vitaliteit.',
        'energie': 'Voel je fitter en alerter.',
        'gezondheid': 'Investeer in je welzijn.',
        'voeding': 'Optimaliseer je dagelijkse intake.',
        'training': 'Bereik je fitnessdoelen sneller.',
        'product': 'Kwaliteit die je kunt vertrouwen.',
        'service': 'Persoonlijke service gegarandeerd.',
        'faq': 'Krijg antwoorden op al je vragen.',
        'contact': 'Neem vandaag nog contact op.',
        'info': 'Ontdek alle details en voordelen.'
    };
    
    for (const [key, benefit] of Object.entries(benefits)) {
        if (keyword.toLowerCase().includes(key)) {
            return benefit;
        }
    }
    
    return 'Ontdek de voordelen voor jezelf.';
}

// Generate contextual call-to-action
function generateContextualCTA(originalContent, domain) {
    const content = (originalContent.title + ' ' + originalContent.metaDesc + ' ' + originalContent.h1).toLowerCase();
    
    if (content.includes('faq') || content.includes('vragen')) {
        return `Vind antwoorden op ${domain}.`;
    }
    if (content.includes('contact') || content.includes('bereik')) {
        return `Neem contact op via ${domain}.`;
    }
    if (content.includes('product') || content.includes('supplement')) {
        return `Bestel nu op ${domain}.`;
    }
    if (content.includes('service') || content.includes('dienst')) {
        return `Ontdek onze diensten op ${domain}.`;
    }
    if (content.includes('info') || content.includes('meer')) {
        return `Lees meer op ${domain}.`;
    }
    
    return `Bezoek ${domain} voor meer informatie.`;
}

// Generate specific SEO recommendations based on content analysis
function generateSEORecommendations(originalContent, optimizedTitle, optimizedMeta, optimizedH1, keywords, domain) {
    const recommendations = [];
    
    // Only suggest improvements that are actually needed
    const contentKeywords = extractKeywordsFromContent(originalContent);
    
    // Title analysis - only if there are real issues
    if (originalContent.title) {
        if (originalContent.title.length < 30) {
            recommendations.push(`Title te kort (${originalContent.title.length} chars) - voeg beschrijvende woorden toe voor betere CTR`);
        } else if (originalContent.title.length > 60) {
            recommendations.push(`Title wordt afgekort in zoekresultaten (${originalContent.title.length} chars) - kort in tot 60 karakters`);
        }
        
        // Check for missing year in evergreen content
        const currentYear = new Date().getFullYear();
        if (!originalContent.title.includes(currentYear.toString()) && 
            (originalContent.title.toLowerCase().includes('gids') || originalContent.title.toLowerCase().includes('tips'))) {
            recommendations.push(`Voeg ${currentYear} toe aan title voor freshness signaal`);
        }
    }
    
    // Meta description analysis - be more specific
    if (originalContent.metaDesc) {
        if (originalContent.metaDesc.length < 120) {
            recommendations.push(`Meta description onderbenut (${originalContent.metaDesc.length} chars) - gebruik 140-160 karakters voor maximale impact`);
        } else if (originalContent.metaDesc.length > 160) {
            recommendations.push(`Meta description wordt afgekort (${originalContent.metaDesc.length} chars) - houd het onder 160 karakters`);
        }
        
        // Check for missing emotional triggers
        const hasEmotionalWords = /\b(beste|gratis|snel|eenvoudig|nieuw|exclusief|betrouwbaar|professioneel)\b/i.test(originalContent.metaDesc);
        if (!hasEmotionalWords) {
            recommendations.push('Voeg emotionele triggers toe aan meta description (bijv. "beste", "gratis", "snel")');
        }
    }
    
    // Content-specific recommendations based on detected keywords
    if (contentKeywords.includes('faq') || contentKeywords.includes('vragen')) {
        recommendations.push('Structureer FAQ met schema markup voor featured snippets');
    } else if (contentKeywords.includes('product') || contentKeywords.includes('supplement')) {
        recommendations.push('Voeg productreviews en ratings toe voor betere conversie');
    } else if (contentKeywords.includes('contact')) {
        recommendations.push('Voeg lokale SEO elementen toe (adres, telefoonnummer, openingstijden)');
    }
    
    // Advanced SEO recommendations based on content type
    if (recommendations.length < 3) {
        if (originalContent.title && originalContent.title.toLowerCase().includes('gids')) {
            recommendations.push('Voeg inhoudsopgave toe voor betere gebruikerservaring en SEO');
        } else if (originalContent.metaDesc && originalContent.metaDesc.includes('€')) {
            recommendations.push('Implementeer product schema markup voor rijke snippets');
        } else {
            recommendations.push('Optimaliseer Core Web Vitals voor betere ranking signalen');
        }
    }
    
    return recommendations.slice(0, 4); // Max 4 recommendations
}

// Process Hugging Face response
function createOptimizedContentFromResponse(originalContent, response) {
    // For now, use smart fallback as Hugging Face response processing is complex
    return createSmartOptimizedContent(originalContent, window.location.href);
}

// Display the optimized content
function displayOptimizedContent(contentArea, optimizedContent) {
    contentArea.innerHTML = `
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde Title</h5>
            <div class="content-item optimized">${optimizedContent.title}</div>
            <div class="content-meta">Lengte: ${optimizedContent.title.length} karakters</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde Meta Description</h5>
            <div class="content-item optimized">${optimizedContent.metaDescription}</div>
            <div class="content-meta">Lengte: ${optimizedContent.metaDescription.length} karakters</div>
        </div>
        
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde H1</h5>
            <div class="content-item optimized">${optimizedContent.h1}</div>
        </div>
        
        ${optimizedContent.h2s && optimizedContent.h2s.length > 0 ? `
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde H2 Tags</h5>
            ${optimizedContent.h2s.map(h2 => `<div class="content-item optimized">${h2}</div>`).join('')}
        </div>
        ` : ''}
        
        ${optimizedContent.content && optimizedContent.content.length > 0 ? `
        <div class="content-section">
            <h5><i class="fas fa-magic"></i> Geoptimaliseerde Hoofdcontent</h5>
            ${optimizedContent.content.map(paragraph => `<div class="content-item optimized">${paragraph}</div>`).join('')}
        </div>
        ` : ''}
        
        <div class="content-section">
            <h5><i class="fas fa-lightbulb"></i> AI SEO Aanbevelingen</h5>
            <div class="seo-recommendations">
                ${optimizedContent.recommendations.map(rec => `
                    <div class="recommendation"><i class="fas fa-check"></i> ${rec}</div>
                `).join('')}
            </div>
        </div>
        
        <div class="ai-attribution">
            <i class="fas fa-robot"></i>
            <span>Gegenereerd met ${getAIProviderName()}</span>
        </div>
    `;
}

// Helper functions for modal actions
function refreshPageContent(url) {
    loadPageContent(url);
}

function copyOptimizedContent() {
    const optimizedContent = document.querySelector('.content-column.optimized .content-area').innerText;
    navigator.clipboard.writeText(optimizedContent).then(() => {
        analysisStorage.showSaveNotification('Geoptimaliseerde content gekopieerd!');
    });
}

function downloadContentComparison() {
    analysisStorage.showSaveNotification('Download functie komt binnenkort beschikbaar!');
}

// Alt Text Generator Functions
let currentImageFile = null;

function showAltTextGenerator() {
    const modal = document.getElementById('altTextGeneratorModal');
    modal.style.display = 'flex';
    
    // Reset form
    resetAltTextGenerator();
    
    // Setup drag and drop
    setupDragAndDrop();
}

function closeAltTextGenerator() {
    const modal = document.getElementById('altTextGeneratorModal');
    modal.style.display = 'none';
    resetAltTextGenerator();
}

function resetAltTextGenerator() {
    currentImageFile = null;
    document.getElementById('imageInput').value = '';
    document.getElementById('contextInput').value = '';
    document.getElementById('styleSelect').value = 'descriptive';
    document.getElementById('generateAltBtn').disabled = true;
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('altTextResults').style.display = 'none';
    document.getElementById('uploadArea').style.display = 'block';
}

function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    
    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleImageUpload(files[0]);
        }
    });
    
    // File input change
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageUpload(e.target.files[0]);
        }
    });
    
    // Click to upload
    uploadArea.addEventListener('click', () => {
        imageInput.click();
    });
}

function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        showErrorMessage('Ongeldig Bestand', 'Selecteer een geldige afbeelding (JPG, PNG, GIF, etc.)');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showErrorMessage('Bestand Te Groot', 'Afbeelding moet kleiner zijn dan 10MB');
        return;
    }
    
    currentImageFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('imageFileName').textContent = `Bestand: ${file.name}`;
        document.getElementById('imageSize').textContent = `Grootte: ${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        document.getElementById('uploadArea').style.display = 'none';
        document.getElementById('imagePreview').style.display = 'flex';
        document.getElementById('generateAltBtn').disabled = false;
    };
    reader.readAsDataURL(file);
}

async function generateAltText() {
    if (!currentImageFile) return;
    
    const generateBtn = document.getElementById('generateAltBtn');
    const originalText = generateBtn.innerHTML;
    
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genereren...';
    generateBtn.disabled = true;
    
    try {
        const context = document.getElementById('contextInput').value.trim();
        const style = document.getElementById('styleSelect').value;
        
        // Check if AI API key is configured
        const apiKey = getAIApiKey();
        if (!apiKey) {
            showAIConfigurationPrompt();
            return;
        }
        
        let altText;
        if (apiKey === 'FREE_HUGGINGFACE') {
            altText = await generateAltTextWithFallback(currentImageFile, context, style);
        } else {
            altText = await generateAltTextWithOpenAI(currentImageFile, context, style, apiKey);
        }
        
        // Display result
        document.getElementById('altTextOutput').value = altText;
        document.getElementById('altTextResults').style.display = 'block';
        
        // Scroll to results
        document.getElementById('altTextResults').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Alt text generation error:', error);
        showErrorMessage('Generatie Fout', `Fout bij het genereren van alt text: ${error.message}`);
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
    }
}

async function generateAltTextWithOpenAI(imageFile, context, style, apiKey) {
    // Convert image to base64
    const base64Image = await fileToBase64(imageFile);
    
    const stylePrompts = {
        descriptive: 'Beschrijf deze afbeelding accuraat en beknopt voor alt text. Focus op de belangrijkste visuele elementen.',
        seo: 'Genereer SEO-geoptimaliseerde alt text die zowel beschrijvend als zoekmachinevriendelijk is.',
        marketing: 'Creëer marketing-gerichte alt text die aantrekkelijk en overtuigend is.',
        accessible: 'Maak toegankelijke alt text die perfect is voor screenreaders en mensen met een visuele beperking.'
    };
    
    const prompt = `${stylePrompts[style]} ${context ? `Context: ${context}. ` : ''}Houd het tussen 50-125 karakters. Antwoord alleen met de alt text, geen extra tekst.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4-vision-preview',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: base64Image } }
                ]
            }],
            max_tokens: 100
        })
    });
    
    if (!response.ok) {
        throw new Error(`OpenAI API fout: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
}

async function generateAltTextWithFallback(imageFile, context, style) {
    // Fallback method using image analysis and smart generation
    const fileName = imageFile.name.toLowerCase();
    const fileType = imageFile.type;
    
    // Basic image analysis based on filename and type
    let baseDescription = 'Afbeelding';
    
    if (fileName.includes('logo')) baseDescription = 'Logo';
    else if (fileName.includes('banner')) baseDescription = 'Banner';
    else if (fileName.includes('product')) baseDescription = 'Product afbeelding';
    else if (fileName.includes('team') || fileName.includes('person')) baseDescription = 'Persoon';
    else if (fileName.includes('office') || fileName.includes('building')) baseDescription = 'Kantoor';
    else if (fileName.includes('chart') || fileName.includes('graph')) baseDescription = 'Grafiek';
    
    // Style-based enhancement
    const styleEnhancements = {
        descriptive: baseDescription,
        seo: `${baseDescription}${context ? ` gerelateerd aan ${context}` : ''}`,
        marketing: `Professionele ${baseDescription.toLowerCase()}${context ? ` voor ${context}` : ''}`,
        accessible: `${baseDescription}${context ? ` in de context van ${context}` : ''}`
    };
    
    let altText = styleEnhancements[style];
    
    // Add context if provided
    if (context && !altText.includes(context)) {
        altText += ` - ${context}`;
    }
    
    // Ensure proper length
    if (altText.length > 125) {
        altText = altText.substring(0, 122) + '...';
    }
    
    return altText;
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function copyAltText() {
    const altTextOutput = document.getElementById('altTextOutput');
    altTextOutput.select();
    document.execCommand('copy');
    
    // Show success notification
    showSuccessNotification('Alt text gekopieerd naar klembord!');
}

function regenerateAltText() {
    generateAltText();
}

function showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Get AI provider display name
function getAIProviderName() {
    const provider = localStorage.getItem('seomax_ai_provider') || 'free';
    return provider === 'free' ? 'Gratis AI (Smart SEO)' : 'OpenAI GPT';
}
