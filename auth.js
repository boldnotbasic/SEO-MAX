// Simple authentication for SEO MAX
class SimpleAuth {
    constructor() {
        this.isAuthenticated = localStorage.getItem('seomax_auth') === 'true';
        this.checkAuth();
    }

    checkAuth() {
        if (!this.isAuthenticated && !this.isLoginPage()) {
            this.showLoginModal();
        }
    }

    isLoginPage() {
        return window.location.hash === '#login';
    }

    showLoginModal() {
        const modal = document.createElement('div');
        modal.id = 'authModal';
        modal.innerHTML = `
            <div class="auth-overlay">
                <div class="auth-modal">
                    <div class="auth-header">
                        <h2>🔒 SEO MAX - Toegang Vereist</h2>
                        <p>Voer de toegangscode in om verder te gaan</p>
                    </div>
                    <div class="auth-form">
                        <input type="password" id="authCode" placeholder="Toegangscode" />
                        <button onclick="auth.login()" id="loginBtn">
                            <i class="fas fa-unlock"></i> Toegang
                        </button>
                    </div>
                    <div class="auth-footer">
                        <p>💡 Contact eigenaar voor toegang</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Focus op input
        document.getElementById('authCode').focus();
        
        // Enter key support
        document.getElementById('authCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    login() {
        const code = document.getElementById('authCode').value;
        const validCodes = ['seomax2024', 'demo123', 'toegang']; // Wijzig deze codes
        
        if (validCodes.includes(code.toLowerCase())) {
            localStorage.setItem('seomax_auth', 'true');
            this.isAuthenticated = true;
            document.getElementById('authModal').remove();
            
            // Success feedback
            this.showSuccessMessage();
        } else {
            this.showError('Onjuiste toegangscode. Probeer opnieuw.');
        }
    }

    showSuccessMessage() {
        const success = document.createElement('div');
        success.className = 'auth-success';
        success.innerHTML = '✅ Toegang verleend! Welkom bij SEO MAX';
        document.body.appendChild(success);
        
        setTimeout(() => success.remove(), 3000);
    }

    showError(message) {
        const error = document.createElement('div');
        error.className = 'auth-error';
        error.innerHTML = `❌ ${message}`;
        document.querySelector('.auth-form').appendChild(error);
        
        setTimeout(() => error.remove(), 3000);
    }

    logout() {
        localStorage.removeItem('seomax_auth');
        window.location.reload();
    }
}

// Initialize authentication
const auth = new SimpleAuth();
