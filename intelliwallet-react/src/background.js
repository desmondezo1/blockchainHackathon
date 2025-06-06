// VaultIQ Background Script - Complete dApp Communication Handler with AI Security
console.log('VaultIQ Background Script: Initializing...');

// Configuration
const AI_SECURITY_API = 'https://ocansey.app.n8n.cloud/webhook/check';

class VaultIQBackground {
  constructor() {
    this.pendingRequests = new Map();
    this.connectedSites = new Map();
    this.approvalCallbacks = new Map();
    this.securityCache = new Map();
    this.setupMessageHandlers();
    this.setupExtensionListeners();
    console.log('✅ VaultIQ Background initialized');
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'vaultiq-popup') {
        this.setupPopupConnection(port);
      }
    });
  }

  setupExtensionListeners() {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tabId, tab);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTabConnections(tabId);
    });
  }

  async handleMessage(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Background received: ${message.type} from ${origin}`, message);

    try {
      // Handle approval responses from popup
      if (message.type === 'CONNECTION_APPROVAL_RESPONSE') {
        await this.handleApprovalResponse(message, sendResponse);
        return;
      }

      // Handle security check requests from popup
      if (message.type === 'REQUEST_SECURITY_CHECK') {
        try {
          const result = await this.performSecurityCheck(message.domain);
          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return;
      }

      // Route message based on type
      switch (message.type) {
        case 'eth_requestAccounts':
          await this.handleRequestAccounts(message, sender, sendResponse);
          break;

        case 'eth_accounts':
          await this.handleGetAccounts(message, sender, sendResponse);
          break;

        case 'eth_chainId':
          await this.handleGetChainId(sendResponse);
          break;

        case 'net_version':
          await this.handleNetVersion(sendResponse);
          break;

        case 'eth_getBalance':
          await this.handleGetBalance(message, sendResponse);
          break;

        case 'eth_blockNumber':
          await this.handleGetBlockNumber(sendResponse);
          break;

        case 'eth_getTransactionCount':
          await this.handleGetTransactionCount(message, sendResponse);
          break;

        case 'eth_sendTransaction':
          await this.handleSendTransaction(message, sender, sendResponse);
          break;

        case 'eth_estimateGas':
          await this.handleEstimateGas(message, sendResponse);
          break;

        case 'eth_gasPrice':
          await this.handleGetGasPrice(sendResponse);
          break;

        case 'personal_sign':
          await this.handlePersonalSign(message, sender, sendResponse);
          break;

        case 'eth_sign':
          await this.handleEthSign(message, sender, sendResponse);
          break;

        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4':
          await this.handleSignTypedData(message, sender, sendResponse);
          break;

        case 'wallet_switchEthereumChain':
          await this.handleSwitchChain(message, sendResponse);
          break;

        case 'wallet_addEthereumChain':
          await this.handleAddChain(message, sendResponse);
          break;

        case 'wallet_getPermissions':
          await this.handleGetPermissions(message, sender, sendResponse);
          break;

        case 'wallet_requestPermissions':
          await this.handleRequestPermissions(message, sender, sendResponse);
          break;

        case 'CHECK_CONNECTION':
          await this.handleCheckConnection(message, sender, sendResponse);
          break;

        case 'DISCONNECT':
          await this.handleDisconnect(message, sender, sendResponse);
          break;

        case 'REQUEST_ACCOUNTS':
          await this.handleRequestAccounts(message, sender, sendResponse);
          break;

        case 'GET_ACCOUNTS':
          await this.handleGetAccounts(message, sender, sendResponse);
          break;

        case 'GET_CHAIN_ID':
          await this.handleGetChainId(sendResponse);
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
          sendResponse({ 
            success: false, 
            error: `Method ${message.type} not supported by VaultIQ` 
          });
      }
    } catch (error) {
      console.error(`Error handling ${message.type}:`, error);
      sendResponse({ 
        success: false, 
        error: `Internal error: ${error.message}` 
      });
    }
  }

  // AI Security Check Method
  async performSecurityCheck(domain) {
    console.log(`🔍 Running AI security check for: ${domain}`);
    
    const cacheKey = domain.toLowerCase();
    const cached = this.securityCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 3600000) {
      console.log(`📄 Using cached security result for ${domain}`);
      return cached.result;
    }

    try {
      const response = await fetch(`${AI_SECURITY_API}?url=${encodeURIComponent(domain)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const result = await response.json();
      const normalizedResult = this.normalizeSecurityResult(result, domain);
      
      this.securityCache.set(cacheKey, {
        result: normalizedResult,
        timestamp: Date.now()
      });

      console.log(`✅ Security check completed for ${domain}:`, normalizedResult);
      return normalizedResult;

    } catch (error) {
      console.error(`❌ Security check failed for ${domain}:`, error);
      
      return {
        status: 'unknown',
        riskLevel: 'medium',
        message: `Unable to verify site security due to API error: ${error.message}. Please verify this site manually before connecting.`,
        risks: ['verification_failed'],
        confidence: 0,
        apiError: true
      };
    }
  }

  normalizeSecurityResult(apiResult, domain) {
    let status, riskLevel, message, risks = [];

    if (apiResult.scam === true) {
      status = 'danger';
      riskLevel = 'high';
      
      if (apiResult.original_domain && apiResult.original_domain !== domain) {
        message = `🚨 SCAM ALERT: This site (${domain}) appears to be impersonating ${apiResult.original_domain}. This is likely a phishing attempt designed to steal your cryptocurrency. DO NOT CONNECT your wallet.`;
        risks = ['phishing', 'impersonation', 'fund_theft'];
      } else {
        message = `🚨 SCAM ALERT: This site (${domain}) has been identified as a fraudulent website. Connecting your wallet could result in stolen funds or compromised accounts.`;
        risks = ['scam', 'fraud', 'fund_theft'];
      }
    } else if (apiResult.scam === false) {
      status = 'safe';
      riskLevel = 'low';
      
      if (apiResult.original_domain && apiResult.original_domain === domain) {
        message = `✅ This appears to be the legitimate ${domain} website. Our AI analysis found no indicators of fraudulent activity.`;
      } else {
        message = `✅ No scam indicators detected for ${domain}. The site appears to be legitimate based on our security analysis.`;
      }
      risks = [];
    } else {
      status = 'unknown';
      riskLevel = 'medium';
      message = `❓ Unable to determine if ${domain} is legitimate. The security analysis returned inconclusive results. Please verify this site manually before connecting.`;
      risks = ['unverified'];
    }

    let additionalInfo = '';
    if (apiResult.original_domain && apiResult.original_domain !== domain) {
      additionalInfo = ` The legitimate site appears to be: ${apiResult.original_domain}`;
    }

    return {
      status,
      riskLevel,
      message: message + additionalInfo,
      risks,
      confidence: apiResult.scam !== undefined ? 95 : 50,
      originalDomain: apiResult.original_domain,
      searchQuery: apiResult.search_query,
      rawApiResult: apiResult,
      checkedAt: new Date().toISOString()
    };
  }

  async handleApprovalResponse(message, sendResponse) {
    const { approved, origin, tabId, securityResult } = message;
    const requestKey = `${origin}_${tabId}`;
    
    console.log(`Security Decision for ${origin}:`, {
      approved,
      securityStatus: securityResult?.status,
      riskLevel: securityResult?.riskLevel,
      userOverrodeWarning: approved && securityResult?.status === 'danger'
    });

    if (securityResult) {
      await this.logSecurityDecision(origin, approved, securityResult);
    }
    
    const callback = this.approvalCallbacks.get(requestKey);
    
    if (callback) {
      this.approvalCallbacks.delete(requestKey);
      
      if (approved) {
        const accounts = await this.getWalletAccounts();
        await this.storeConnectionPermission(origin, accounts[0], securityResult);
        this.updateConnectionActivity(origin);
        this.notifyConnectionChange(origin, accounts[0], true);
        
        callback.resolve(true);
      } else {
        callback.resolve(false);
      }
    }
    
    sendResponse({ success: true });
  }

  async handleRequestAccounts(message, sender, sendResponse) {
    const origin = message.origin || this.getOriginFromSender(sender);
    console.log(`Account request from: ${origin}`);
    
    try {
      const walletStatus = await this.getWalletStatus();
      
      if (!walletStatus.hasWallet) {
        sendResponse({ 
          success: false, 
          error: 'No wallet found. Please create a wallet in VaultIQ extension.' 
        });
        return;
      }

      if (!walletStatus.isUnlocked) {
        try {
          await chrome.action.openPopup();
        } catch (popupError) {
          console.log('Could not open popup:', popupError);
        }
        
        sendResponse({ 
          success: false, 
          error: 'Wallet is locked. Please unlock VaultIQ extension to continue.' 
        });
        return;
      }

      const existingConnection = await this.checkConnectionPermission(origin);
      
      if (existingConnection) {
        const accounts = await this.getWalletAccounts();
        this.updateConnectionActivity(origin);
        sendResponse({ success: true, result: accounts, accounts });
        return;
      }

      console.log(`🔍 Pre-running security check for ${origin}...`);
      const securityResult = await this.performSecurityCheck(origin);
      
      await chrome.storage.local.set({
        [`security_${origin}`]: securityResult
      });

      const approved = await this.requestConnectionApproval(origin, sender, securityResult);
      
      if (approved) {
        const accounts = await this.getWalletAccounts();
        sendResponse({ success: true, result: accounts, accounts });
      } else {
        sendResponse({ 
          success: false, 
          error: 'User rejected the connection request' 
        });
      }
      
    } catch (error) {
      console.error('Request accounts error:', error);
      sendResponse({ 
        success: false, 
        error: `Connection failed: ${error.message}` 
      });
    }
  }

  async requestConnectionApproval(origin, sender, securityResult = null) {
    const tabId = sender.tab?.id;
    
    console.log(`🔔 Requesting connection approval for: ${origin}`, {
      securityStatus: securityResult?.status,
      riskLevel: securityResult?.riskLevel
    });
    
    return new Promise(async (resolve, reject) => {
      try {
        const requestKey = `${origin}_${tabId}`;
        this.approvalCallbacks.set(requestKey, { resolve, reject });
        
        await chrome.storage.local.set({
          pendingConnection: {
            origin,
            tabId,
            timestamp: Date.now(),
            securityResult
          }
        });

        const popup = await chrome.windows.create({
          url: chrome.runtime.getURL(`approval.html?origin=${encodeURIComponent(origin)}&tabId=${tabId}`),
          type: 'popup',
          width: 420,
          height: 600,
          focused: true
        });

        console.log(`✅ AI Security approval popup created: ${popup.id}`);

        setTimeout(() => {
          if (this.approvalCallbacks.has(requestKey)) {
            this.approvalCallbacks.delete(requestKey);
            console.log(`⏰ Approval timeout for ${origin}`);
            resolve(false);
            chrome.windows.remove(popup.id).catch(() => {});
          }
        }, 60000);

        chrome.windows.onRemoved.addListener((windowId) => {
          if (windowId === popup.id && this.approvalCallbacks.has(requestKey)) {
            this.approvalCallbacks.delete(requestKey);
            console.log(`🪟 AI Security popup closed without response for ${origin}`);
            resolve(false);
          }
        });

      } catch (error) {
        console.error('Error creating AI security popup:', error);
        resolve(false);
      }
    });
  }

  async handleGetAccounts(message, sender, sendResponse) {
    try {
      const origin = message.origin || this.getOriginFromSender(sender);
      const walletStatus = await this.getWalletStatus();
      
      if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
        sendResponse({ success: true, result: [], accounts: [] });
        return;
      }

      const isConnected = await this.checkConnectionPermission(origin);
      
      if (isConnected) {
        const accounts = await this.getWalletAccounts();
        this.updateConnectionActivity(origin);
        sendResponse({ success: true, result: accounts, accounts });
      } else {
        sendResponse({ success: true, result: [], accounts: [] });
      }
      
    } catch (error) {
      console.error('Get accounts error:', error);
      sendResponse({ success: true, result: [], accounts: [] });
    }
  }

  async handleGetChainId(sendResponse) {
    try {
      const chainId = await this.getCurrentChainId();
      sendResponse({ success: true, result: chainId, chainId });
    } catch (error) {
      console.error('Get chain ID error:', error);
      sendResponse({ success: true, result: '0x1', chainId: '0x1' });
    }
  }

  async handleNetVersion(sendResponse) {
    try {
      const chainId = await this.getCurrentChainId();
      const version = parseInt(chainId, 16).toString();
      sendResponse({ success: true, result: version });
    } catch (error) {
      sendResponse({ success: true, result: '1' });
    }
  }

  async handleGetBalance(message, sendResponse) {
    const params = message.params || [];
    const address = params[0];
    const blockTag = params[1] || 'latest';
    
    if (!address) {
      sendResponse({ success: false, error: 'Address parameter required' });
      return;
    }

    sendResponse({ 
      success: false, 
      error: 'Balance fetching via dApp not implemented. Use VaultIQ extension directly.' 
    });
  }

  async handleGetBlockNumber(sendResponse) {
    sendResponse({ 
      success: false, 
      error: 'Block number fetching not implemented' 
    });
  }

  async handleGetTransactionCount(message, sendResponse) {
    sendResponse({ 
      success: false, 
      error: 'Transaction count fetching not implemented' 
    });
  }

  async handleSendTransaction(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Transaction request from ${origin}:`, message.params);
    
    try {
      const walletStatus = await this.getWalletStatus();
      
      if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
        sendResponse({ success: false, error: 'Wallet locked or not found' });
        return;
      }

      const isConnected = await this.checkConnectionPermission(origin);
      if (!isConnected) {
        sendResponse({ success: false, error: 'Site not connected to wallet' });
        return;
      }

      const txParams = message.params?.[0] || {};
      
      console.log('Transaction approval needed for:', txParams);
      
      sendResponse({ 
        success: false, 
        error: 'Transaction approval system not implemented yet. Please use VaultIQ extension directly for transactions.' 
      });
      
    } catch (error) {
      console.error('Send transaction error:', error);
      sendResponse({ 
        success: false, 
        error: `Transaction failed: ${error.message}` 
      });
    }
  }

  async handleEstimateGas(message, sendResponse) {
    sendResponse({ 
      success: false, 
      error: 'Gas estimation not implemented' 
    });
  }

  async handleGetGasPrice(sendResponse) {
    sendResponse({ 
      success: false, 
      error: 'Gas price fetching not implemented' 
    });
  }

  async handlePersonalSign(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Personal sign request from ${origin}:`, message.params);
    
    const walletStatus = await this.getWalletStatus();
    
    if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
      sendResponse({ success: false, error: 'Wallet locked or not found' });
      return;
    }

    const isConnected = await this.checkConnectionPermission(origin);
    if (!isConnected) {
      sendResponse({ success: false, error: 'Site not connected to wallet' });
      return;
    }

    console.log('Signature approval needed');
    sendResponse({ 
      success: false, 
      error: 'Message signing approval system not implemented yet' 
    });
  }

  async handleEthSign(message, sender, sendResponse) {
    sendResponse({ 
      success: false, 
      error: 'eth_sign is deprecated due to security risks. Use personal_sign instead.' 
    });
  }

  async handleSignTypedData(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Typed data sign request from ${origin}:`, message.params);
    
    const walletStatus = await this.getWalletStatus();
    
    if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
      sendResponse({ success: false, error: 'Wallet locked or not found' });
      return;
    }

    const isConnected = await this.checkConnectionPermission(origin);
    if (!isConnected) {
      sendResponse({ success: false, error: 'Site not connected to wallet' });
      return;
    }

    sendResponse({ 
      success: false, 
      error: 'Typed data signing approval system not implemented yet' 
    });
  }

  async handleSwitchChain(message, sendResponse) {
    try {
      const chainId = message.params?.[0]?.chainId || message.chainId;
      console.log(`Switch chain request to: ${chainId}`);
      
      const networkMap = {
        '0x1': 'ethereum',
        '0x89': 'polygon',
        '0xa4b1': 'arbitrum',
        '0xa': 'optimism',
        '0xaa36a7': 'sepolia',
        '0x13881': 'mumbai'
      };
      
      const network = networkMap[chainId];
      if (network) {
        await chrome.storage.local.set({ selected_network: network });
        console.log(`✅ Switched to network: ${network}`);
        
        this.notifyChainChange(chainId);
        
        sendResponse({ success: true, result: null });
      } else {
        sendResponse({ 
          success: false, 
          error: `Unsupported network: ${chainId}. VaultIQ supports Ethereum, Polygon, Arbitrum, Optimism, and their testnets.` 
        });
      }
    } catch (error) {
      console.error('Switch chain error:', error);
      sendResponse({ 
        success: false, 
        error: `Network switch failed: ${error.message}` 
      });
    }
  }

  async handleAddChain(message, sendResponse) {
    const chainParams = message.params?.[0] || message.chainParams;
    console.log('Add chain request:', chainParams);
    
    sendResponse({ 
      success: false, 
      error: 'Adding custom chains not implemented yet. VaultIQ supports major networks and their testnets.' 
    });
  }

  async handleGetPermissions(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    const isConnected = await this.checkConnectionPermission(origin);
    
    const permissions = [];
    if (isConnected) {
      permissions.push({
        invoker: origin,
        parentCapability: 'eth_accounts',
        caveats: []
      });
    }
    
    sendResponse({ success: true, result: permissions });
  }

  async handleRequestPermissions(message, sender, sendResponse) {
    const requestedPerms = message.params?.[0] || {};
    
    if (requestedPerms.eth_accounts) {
      await this.handleRequestAccounts(message, sender, sendResponse);
    } else {
      sendResponse({ 
        success: false, 
        error: 'Only eth_accounts permission is supported' 
      });
    }
  }

  async handleCheckConnection(message, sender, sendResponse) {
    try {
      const origin = message.origin || this.getOriginFromSender(sender);
      const isConnected = await this.checkConnectionPermission(origin);
      const walletStatus = await this.getWalletStatus();
      
      if (isConnected && walletStatus.hasWallet && walletStatus.isUnlocked) {
        const accounts = await this.getWalletAccounts();
        const chainId = await this.getCurrentChainId();
        
        sendResponse({
          success: true,
          isConnected: true,
          account: accounts[0],
          chainId,
          result: { isConnected: true, account: accounts[0], chainId }
        });
      } else {
        sendResponse({
          success: true,
          isConnected: false,
          result: { isConnected: false }
        });
      }
    } catch (error) {
      sendResponse({
        success: true,
        isConnected: false,
        result: { isConnected: false }
      });
    }
  }

  async handleDisconnect(message, sender, sendResponse) {
    const origin = message.origin || this.getOriginFromSender(sender);
    
    try {
      await this.removeConnectionPermission(origin);
      this.notifyConnectionChange(origin, null, false);
      
      sendResponse({ success: true, result: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  getOriginFromSender(sender) {
    if (sender.tab && sender.tab.url) {
      try {
        return new URL(sender.tab.url).origin;
      } catch {
        return sender.tab.url;
      }
    }
    return sender.origin || 'unknown';
  }

  async getWalletStatus() {
    try {
      const result = await chrome.storage.local.get(['has_wallet', 'encrypted_wallet']);
      return {
        hasWallet: !!(result.has_wallet || result.encrypted_wallet),
        isUnlocked: true
      };
    } catch {
      return { hasWallet: false, isUnlocked: false };
    }
  }

  async getWalletAccounts() {
    try {
      const result = await chrome.storage.local.get(['wallet_address']);
      return result.wallet_address ? [result.wallet_address] : [];
    } catch {
      return [];
    }
  }

  async getCurrentChainId() {
    try {
      const result = await chrome.storage.local.get(['selected_network']);
      const network = result.selected_network || 'ethereum';
      
      const chainIds = {
        'ethereum': '0x1',
        'polygon': '0x89',
        'arbitrum': '0xa4b1',
        'optimism': '0xa',
        'sepolia': '0xaa36a7',
        'mumbai': '0x13881'
      };
      
      return chainIds[network] || '0x1';
    } catch {
      return '0x1';
    }
  }

  async checkConnectionPermission(origin) {
    try {
      const result = await chrome.storage.local.get([`connection_${origin}`]);
      const connection = result[`connection_${origin}`];
      
      if (!connection) return false;
      
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return connection.timestamp > thirtyDaysAgo;
    } catch {
      return false;
    }
  }

  async storeConnectionPermission(origin, account, securityResult = null) {
    try {
      const connectionData = {
        account,
        timestamp: Date.now(),
        origin,
        securityCheck: securityResult ? {
          status: securityResult.status,
          riskLevel: securityResult.riskLevel,
          checkedAt: securityResult.checkedAt,
          confidence: securityResult.confidence
        } : null
      };

      await chrome.storage.local.set({
        [`connection_${origin}`]: connectionData
      });
      
      console.log(`✅ Stored connection permission for: ${origin}`, connectionData);
    } catch (error) {
      console.error('Failed to store connection permission:', error);
    }
  }

  async removeConnectionPermission(origin) {
    try {
      await chrome.storage.local.remove([`connection_${origin}`]);
      console.log(`✅ Removed connection permission for: ${origin}`);
    } catch (error) {
      console.error('Failed to remove connection permission:', error);
    }
  }

  updateConnectionActivity(origin) {
    this.connectedSites.set(origin, {
      lastActivity: Date.now(),
      origin
    });
  }

  async logSecurityDecision(origin, approved, securityResult) {
    try {
      const logEntry = {
        timestamp: Date.now(),
        origin,
        approved,
        securityStatus: securityResult.status,
        riskLevel: securityResult.riskLevel,
        confidence: securityResult.confidence,
        userOverrodeWarning: approved && ['warning', 'danger'].includes(securityResult.status)
      };

      const { securityLogs = [] } = await chrome.storage.local.get(['securityLogs']);
      
      securityLogs.push(logEntry);
      
      if (securityLogs.length > 100) {
        securityLogs.splice(0, securityLogs.length - 100);
      }
      
      await chrome.storage.local.set({ securityLogs });
      
      console.log(`📝 Logged security decision for ${origin}`);
    } catch (error) {
      console.error('Failed to log security decision:', error);
    }
  }

  notifyConnectionChange(origin, account, connected) {
    console.log(`🔔 Connection ${connected ? 'established' : 'removed'} for ${origin}`);
  }

  notifyChainChange(chainId) {
    console.log(`🔔 Chain changed to: ${chainId}`);
  }

  handleTabUpdate(tabId, tab) {
    if (tab.url) {
      const origin = new URL(tab.url).origin;
      this.updateConnectionActivity(origin);
    }
  }

  cleanupTabConnections(tabId) {
    console.log(`🧹 Cleaning up connections for tab: ${tabId}`);
  }

  setupPopupConnection(port) {
    console.log('📱 Popup connected');
    
    port.onMessage.addListener((message) => {
      console.log('Popup message:', message);
    });
    
    port.onDisconnect.addListener(() => {
      console.log('📱 Popup disconnected');
    });
  }
}

const vaultIQBackground = new VaultIQBackground();

chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 VaultIQ extension started');
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('📦 VaultIQ extension installed/updated:', details.reason);
});

console.log('✅ VaultIQ Background Script loaded successfully');