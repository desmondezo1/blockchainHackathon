// VaultIQ Background Script - Complete dApp Communication Handler
console.log('VaultIQ Background Script: Initializing...');

class VaultIQBackground {
  constructor() {
    this.pendingRequests = new Map();
    this.connectedSites = new Map();
    this.setupMessageHandlers();
    this.setupExtensionListeners();
    console.log('✅ VaultIQ Background initialized');
  }

  setupMessageHandlers() {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Listen for extension popup connections
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'vaultiq-popup') {
        this.setupPopupConnection(port);
      }
    });
  }

  setupExtensionListeners() {
    // Monitor tab updates for connection management
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tabId, tab);
      }
    });

    // Handle tab removal for cleanup
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTabConnections(tabId);
    });
  }

  async handleMessage(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Background received: ${message.type} from ${origin}`, message);

    try {
      // Route message based on type
      switch (message.type) {
        // Account Management
        case 'eth_requestAccounts':
          await this.handleRequestAccounts(message, sender, sendResponse);
          break;

        case 'eth_accounts':
          await this.handleGetAccounts(message, sender, sendResponse);
          break;

        // Network Information
        case 'eth_chainId':
          await this.handleGetChainId(sendResponse);
          break;

        case 'net_version':
          await this.handleNetVersion(sendResponse);
          break;

        // Balance and Blockchain Data
        case 'eth_getBalance':
          await this.handleGetBalance(message, sendResponse);
          break;

        case 'eth_blockNumber':
          await this.handleGetBlockNumber(sendResponse);
          break;

        case 'eth_getTransactionCount':
          await this.handleGetTransactionCount(message, sendResponse);
          break;

        // Transaction Methods
        case 'eth_sendTransaction':
          await this.handleSendTransaction(message, sender, sendResponse);
          break;

        case 'eth_estimateGas':
          await this.handleEstimateGas(message, sendResponse);
          break;

        case 'eth_gasPrice':
          await this.handleGetGasPrice(sendResponse);
          break;

        // Signing Methods
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

        // Network Management
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

        // Connection Management
        case 'CHECK_CONNECTION':
          await this.handleCheckConnection(message, sender, sendResponse);
          break;

        case 'DISCONNECT':
          await this.handleDisconnect(message, sender, sendResponse);
          break;

        // Legacy message types for backward compatibility
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

  // Account Management Methods
  async handleRequestAccounts(message, sender, sendResponse) {
    const origin = message.origin || this.getOriginFromSender(sender);
    console.log(`Account request from: ${origin}`);
    
    try {
      // Check wallet status
      const walletStatus = await this.getWalletStatus();
      
      if (!walletStatus.hasWallet) {
        sendResponse({ 
          success: false, 
          error: 'No wallet found. Please create a wallet in VaultIQ extension.' 
        });
        return;
      }

      if (!walletStatus.isUnlocked) {
        // Try to open popup for unlock
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

      // Check existing connection
      const existingConnection = await this.checkConnectionPermission(origin);
      
      if (existingConnection) {
        const accounts = await this.getWalletAccounts();
        this.updateConnectionActivity(origin);
        sendResponse({ success: true, result: accounts, accounts });
        return;
      }

      // Request new connection approval
      const approved = await this.requestConnectionApproval(origin, sender);
      
      if (approved) {
        const accounts = await this.getWalletAccounts();
        await this.storeConnectionPermission(origin, accounts[0]);
        this.updateConnectionActivity(origin);
        
        // Notify about new connection
        this.notifyConnectionChange(origin, accounts[0], true);
        
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

  async handleGetAccounts(message, sender, sendResponse) {
    try {
      const origin = message.origin || this.getOriginFromSender(sender);
      const walletStatus = await this.getWalletStatus();
      
      if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
        sendResponse({ success: true, result: [], accounts: [] });
        return;
      }

      // Check if site is connected
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

  // Network Information Methods
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

  // Blockchain Data Methods
  async handleGetBalance(message, sendResponse) {
    const params = message.params || [];
    const address = params[0];
    const blockTag = params[1] || 'latest';
    
    if (!address) {
      sendResponse({ success: false, error: 'Address parameter required' });
      return;
    }

    // For now, return error - implement with your blockchain provider
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

  // Transaction Methods
  async handleSendTransaction(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Transaction request from ${origin}:`, message.params);
    
    try {
      const walletStatus = await this.getWalletStatus();
      
      if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
        sendResponse({ success: false, error: 'Wallet locked or not found' });
        return;
      }

      // Check connection permission
      const isConnected = await this.checkConnectionPermission(origin);
      if (!isConnected) {
        sendResponse({ success: false, error: 'Site not connected to wallet' });
        return;
      }

      const txParams = message.params?.[0] || {};
      
      // For now, show approval needed message
      // In production, implement transaction approval popup
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

  // Signing Methods
  async handlePersonalSign(message, sender, sendResponse) {
    const origin = this.getOriginFromSender(sender);
    console.log(`Personal sign request from ${origin}:`, message.params);
    
    const walletStatus = await this.getWalletStatus();
    
    if (!walletStatus.hasWallet || !walletStatus.isUnlocked) {
      sendResponse({ success: false, error: 'Wallet locked or not found' });
      return;
    }

    // Check connection permission
    const isConnected = await this.checkConnectionPermission(origin);
    if (!isConnected) {
      sendResponse({ success: false, error: 'Site not connected to wallet' });
      return;
    }

    // For now, reject signing requests
    console.log('Signature approval needed');
    sendResponse({ 
      success: false, 
      error: 'Message signing approval system not implemented yet' 
    });
  }

  async handleEthSign(message, sender, sendResponse) {
    // eth_sign is dangerous and deprecated
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

    // Check connection permission
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

  // Network Management Methods
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
        
        // Notify all connected sites about chain change
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

  // Permission Methods
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
    // Redirect to eth_requestAccounts for account permissions
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

  // Connection Management
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

  // Helper Methods
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
        isUnlocked: true // For now, assume unlocked if wallet exists
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
      
      // Check if connection is still valid (not older than 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return connection.timestamp > thirtyDaysAgo;
    } catch {
      return false;
    }
  }

  async storeConnectionPermission(origin, account) {
    try {
      await chrome.storage.local.set({
        [`connection_${origin}`]: {
          account,
          timestamp: Date.now(),
          origin
        }
      });
      console.log(`✅ Stored connection permission for: ${origin}`);
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

  async requestConnectionApproval(origin, sender) {
    // For now, auto-approve for testing
    // In production, implement approval popup
    console.log(`🔔 Auto-approving connection request from: ${origin}`);
    
    // You would implement approval popup here:
    // const approved = await this.showConnectionApprovalPopup(origin, sender);
    
    return true; // Auto-approve for testing
  }

  // Event notification methods
  notifyConnectionChange(origin, account, connected) {
    console.log(`🔔 Connection ${connected ? 'established' : 'removed'} for ${origin}`);
    // Implement event broadcasting to content scripts if needed
  }

  notifyChainChange(chainId) {
    console.log(`🔔 Chain changed to: ${chainId}`);
    // Implement event broadcasting to content scripts if needed
  }

  // Tab management
  handleTabUpdate(tabId, tab) {
    // Handle tab updates for connection management
    if (tab.url) {
      const origin = new URL(tab.url).origin;
      this.updateConnectionActivity(origin);
    }
  }

  cleanupTabConnections(tabId) {
    // Cleanup when tabs are closed
    console.log(`🧹 Cleaning up connections for tab: ${tabId}`);
  }

  setupPopupConnection(port) {
    console.log('📱 Popup connected');
    
    port.onMessage.addListener((message) => {
      console.log('Popup message:', message);
      // Handle popup messages
    });
    
    port.onDisconnect.addListener(() => {
      console.log('📱 Popup disconnected');
    });
  }
}

// Initialize background script
const vaultIQBackground = new VaultIQBackground();

// Global error handler
chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 VaultIQ extension started');
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('📦 VaultIQ extension installed/updated:', details.reason);
});

console.log('✅ VaultIQ Background Script loaded successfully');