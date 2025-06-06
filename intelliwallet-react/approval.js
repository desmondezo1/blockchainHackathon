let connectionData = {};
let securityResult = null;

async function loadConnectionData() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const origin = urlParams.get('origin');
        const tabId = urlParams.get('tabId');

        if (origin) {
            connectionData = { origin, tabId };
            updateUI();
            await performSecurityCheck();
        } else {
            const result = await chrome.storage.local.get(['pendingConnection']);
            if (result.pendingConnection) {
                connectionData = result.pendingConnection;
                updateUI();
                await performSecurityCheck();
            }
        }
    } catch (error) {
        console.error('Error loading connection data:', error);
    }
}

async function updateUI() {
    try {
        const siteUrl = connectionData.origin || 'Unknown site';
        document.getElementById('siteUrl').textContent = siteUrl;

        try {
            const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(siteUrl)}&sz=64`;
            document.getElementById('siteIcon').innerHTML = `<img src="${favicon}" width="32" height="32" style="border-radius: 6px;" onerror="this.style.display='none'; this.parentNode.innerHTML='🌐';">`;
        } catch (e) {
            document.getElementById('siteIcon').textContent = '🌐';
        }

        const storage = await chrome.storage.local.get(['wallet_address', 'selected_network']);
        const address = storage.wallet_address || 'Not available';
        const network = storage.selected_network || 'ethereum';

        document.getElementById('accountAddress').textContent = 
            `${address.slice(0, 6)}...${address.slice(-4)}`;

        const networkNames = {
            'ethereum': 'Ethereum Mainnet',
            'sepolia': 'Sepolia Testnet',
            'polygon': 'Polygon',
            'arbitrum': 'Arbitrum',
            'optimism': 'Optimism'
        };
        document.getElementById('networkName').textContent = 
            networkNames[network] || network;

    } catch (error) {
        console.error('Error updating UI:', error);
    }
}

async function performSecurityCheck() {
    const domain = connectionData.origin;
    
    try {
        const storage = await chrome.storage.local.get([`security_${domain}`]);
        const preComputedResult = storage[`security_${domain}`];
        
        if (preComputedResult) {
            console.log('Using pre-computed security result');
            securityResult = preComputedResult;
            updateSecurityStatus(preComputedResult);
            return;
        }

        console.log('Requesting fresh security analysis...');
        
        const response = await chrome.runtime.sendMessage({
            type: 'REQUEST_SECURITY_CHECK',
            domain: domain
        });

        if (response && response.success) {
            securityResult = response.result;
            updateSecurityStatus(response.result);
        } else {
            throw new Error(response?.error || 'Security check failed');
        }
        
    } catch (error) {
        console.error('Security check failed:', error);
        securityResult = {
            status: 'unknown',
            riskLevel: 'medium',
            message: 'Unable to verify site security due to connection error. Please verify this site manually before connecting.',
            risks: ['verification_failed'],
            apiError: true
        };
        updateSecurityStatus(securityResult);
    }
}

function updateSecurityStatus(result) {
    const statusEl = document.getElementById('securityStatus');
    const analysisEl = document.getElementById('aiAnalysis');
    const indicatorsEl = document.getElementById('riskIndicators');
    const approveBtn = document.getElementById('approveBtn');

    statusEl.className = 'security-status';
    
    if (result.status === 'safe') {
        statusEl.classList.add('status-safe');
        statusEl.innerHTML = `
            <span class="status-icon">✅</span>
            <span class="status-text">Site appears safe</span>
        `;
        approveBtn.textContent = 'Connect';
        approveBtn.disabled = false;
        approveBtn.classList.remove('danger');
        approveBtn.style.opacity = '1';
        approveBtn.style.cursor = 'pointer';
    } else if (result.status === 'warning') {
        statusEl.classList.add('status-warning');
        statusEl.innerHTML = `
            <span class="status-icon">⚠️</span>
            <span class="status-text">Proceed with caution</span>
        `;
        approveBtn.textContent = 'Connect Anyway';
        approveBtn.disabled = false;
        approveBtn.classList.remove('danger');
        approveBtn.style.opacity = '1';
        approveBtn.style.cursor = 'pointer';
    } else if (result.status === 'danger') {
        statusEl.classList.add('status-danger');
        statusEl.innerHTML = `
            <span class="status-icon">🚨</span>
            <span class="status-text">Connection blocked - Scam detected</span>
        `;
        approveBtn.textContent = 'Connection Blocked';
        approveBtn.disabled = true;
        approveBtn.classList.add('danger');
        approveBtn.style.opacity = '0.3';
        approveBtn.style.cursor = 'not-allowed';
    } else {
        statusEl.classList.add('status-warning');
        statusEl.innerHTML = `
            <span class="status-icon">❓</span>
            <span class="status-text">Unable to verify safety</span>
        `;
        approveBtn.textContent = 'Connect (Unverified)';
        approveBtn.disabled = false;
        approveBtn.style.opacity = '1';
        approveBtn.style.cursor = 'pointer';
    }

    analysisEl.style.display = 'block';
    analysisEl.textContent = result.message || 'No additional analysis available.';

    if (result.risks && result.risks.length > 0) {
        indicatorsEl.style.display = 'flex';
        indicatorsEl.innerHTML = '';
        
        result.risks.forEach(risk => {
            const tag = document.createElement('div');
            tag.className = `risk-tag risk-${result.riskLevel || 'medium'}`;
            tag.textContent = risk.replace('_', ' ');
            indicatorsEl.appendChild(tag);
        });
    }
}

document.getElementById('approveBtn').addEventListener('click', async () => {
    // Block connection if dangerous
    if (securityResult && securityResult.status === 'danger') {
        return; // Do nothing, connection blocked
    }
    
    try {
        await chrome.runtime.sendMessage({
            type: 'CONNECTION_APPROVAL_RESPONSE',
            approved: true,
            origin: connectionData.origin,
            tabId: connectionData.tabId,
            securityResult: securityResult
        });
        window.close();
    } catch (error) {
        console.error('Error approving connection:', error);
    }
});

document.getElementById('rejectBtn').addEventListener('click', async () => {
    try {
        await chrome.runtime.sendMessage({
            type: 'CONNECTION_APPROVAL_RESPONSE',
            approved: false,
            origin: connectionData.origin,
            tabId: connectionData.tabId,
            securityResult: securityResult
        });
        window.close();
    } catch (error) {
        console.error('Error rejecting connection:', error);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('rejectBtn').click();
    }
});

loadConnectionData();