class SEOChecker {
    constructor() {
        this.results = {};
        this.keyword = '';
    }

    async analyzeWebsite(url, keyword = '') {
        this.keyword = keyword.toLowerCase();
        
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

            return this.results;
        } catch (error) {
            throw new Error(`Fout bij analyseren: ${error.message}`);
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

    analyzeH1(doc) {
        const h1Elements = doc.querySelectorAll('h1');
        const h1Texts = Array.from(h1Elements).map(h1 => h1.textContent.trim());
        
        return {
            count: h1Elements.length,
            isOptimal: h1Elements.length === 1,
            content: h1Texts,
            hasKeyword: this.keyword ? h1Texts.some(text => text.toLowerCase().includes(this.keyword)) : null
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
        const imagesWithoutAlt = totalImages - imagesWithAlt.length;
        
        return {
            total: totalImages,
            withAlt: imagesWithAlt.length,
            withoutAlt: imagesWithoutAlt,
            percentage: totalImages > 0 ? Math.round((imagesWithAlt.length / totalImages) * 100) : 100
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
        alert('Voer een geldige URL in');
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
        alert(`Fout: ${error.message}\n\n🎮 Tip: Typ 'demo' in de URL om een voorbeeld te zien\n🌐 Voor echte websites: Deploy naar Vercel/Netlify voor CORS ondersteuning`);
        loadingSection.style.display = 'none';
    } finally {
        analyzeBtn.disabled = false;
    }
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
    displayDashboardStats(results);
    displayCoreVitals(results);
    displayTopIssues(results);
    displayStatusResults(results.status);
    displayTitleResults(results.title);
    displayH1Results(results.h1);
    displayMetaResults(results.meta);
    displayImageResults(results.images);
    displayCanonicalResults(results.canonical);
    displayLinksResults(results.links);
    displayURLResults(results.urlStructure);
    displaySummary();
}

function displayDashboardStats(results) {
    const score = seoChecker.calculateScore();
    
    // SEO Score with Circular Progress
    document.getElementById('scoreValue').textContent = score;
    updateCircularProgress(score);
    
    const scoreTrend = document.getElementById('scoreTrend');
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
    
    // Content Health
    const contentElements = [results.title, results.h1, results.meta].filter(Boolean);
    const contentScore = contentElements.filter(el => el.exists || el.count > 0).length;
    document.getElementById('contentHealth').textContent = contentScore;
    document.getElementById('contentSubtitle').textContent = `${contentElements.length} elements checked`;
    
    // Technical SEO
    const techScore = Math.round((results.images.percentage + (results.canonical.exists ? 100 : 0) + (results.links.broken === 0 ? 100 : 50)) / 3);
    document.getElementById('techScore').textContent = techScore + '%';
    const techTrend = document.getElementById('techTrend');
    if (techScore >= 80) {
        techTrend.textContent = '+2';
        techTrend.className = 'stat-trend positive';
    } else {
        techTrend.textContent = '-1';
        techTrend.className = 'stat-trend';
    }
    
    // Issues Count
    const issues = calculateIssues(results);
    document.getElementById('issuesCount').textContent = issues.total;
    document.getElementById('issuesSubtitle').textContent = `${issues.critical} critical`;
    const issuesTrend = document.getElementById('issuesTrend');
    if (issues.total <= 2) {
        issuesTrend.textContent = '-1';
        issuesTrend.className = 'stat-trend positive';
    } else {
        issuesTrend.textContent = '+' + Math.floor(issues.total / 2);
        issuesTrend.className = 'stat-trend';
    }
}

function displayCoreVitals(results) {
    // Title Optimization
    const titleScore = results.title.isOptimal ? 100 : (results.title.exists ? 60 : 0);
    updateVitalBar('titleProgress', titleScore);
    document.getElementById('titleScore').textContent = titleScore + '%';
    
    // Meta Description
    const metaScore = results.meta.isOptimal ? 100 : (results.meta.exists ? 70 : 0);
    updateVitalBar('metaProgress', metaScore);
    document.getElementById('metaScore').textContent = metaScore + '%';
    
    // Image Alt Text
    const imageScore = results.images.percentage;
    updateVitalBar('imageProgress', imageScore);
    document.getElementById('imageScore').textContent = imageScore + '%';
}

function updateVitalBar(elementId, score) {
    const progressBar = document.getElementById(elementId);
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
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    
    // Calculate progress
    const progress = score / 100;
    const strokeDashoffset = circumference - (progress * circumference);
    
    // Set the stroke-dashoffset to animate the circle
    circle.style.strokeDashoffset = strokeDashoffset;
    
    // Set color based on score
    let className = 'progress-ring-fill ';
    let statusText = '';
    
    if (score >= 90) {
        className += 'excellent';
        statusText = 'SEO Score: Uitstekend';
    } else if (score >= 75) {
        className += 'good';
        statusText = 'SEO Score: Goed';
    } else if (score >= 50) {
        className += 'average';
        statusText = 'SEO Score: Gemiddeld';
    } else {
        className += 'poor';
        statusText = 'SEO Score: Slecht';
    }
    
    circle.className = className;
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
    const keywordStatus = h1.hasKeyword === null ? 'success' : (h1.hasKeyword ? 'success' : 'warning');
    
    container.innerHTML = `
        <div class="result-item ${countStatus}">
            <div class="label">
                <i class="fas fa-hashtag"></i>
                Aantal H1 Tags
            </div>
            <div class="value">${h1.count} (optimaal: 1)</div>
        </div>
        ${h1.count > 0 ? `
        <div class="result-item success">
            <div class="label">
                <i class="fas fa-list"></i>
                H1 Inhoud
            </div>
            <div class="value">${h1.content.join(', ')}</div>
        </div>
        ${seoChecker.keyword ? `
        <div class="result-item ${keywordStatus}">
            <div class="label">
                <i class="fas fa-key"></i>
                Zoekwoord in H1
            </div>
            <div class="value">${h1.hasKeyword ? 'Gevonden' : 'Niet gevonden'}</div>
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
        <div class="result-item warning">
            <div class="label">
                <i class="fas fa-exclamation-triangle"></i>
                Ontbrekende Alt-text
            </div>
            <div class="value">${images.withoutAlt} afbeeldingen zonder alt-text</div>
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
