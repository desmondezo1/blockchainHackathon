// VaultIQ Provider Injection Script - Runs in page context
console.log('🚀 VaultIQ Provider: Injecting into page context...');

// VaultIQ Provider Class - Full EIP-1193 Implementation
class VaultIQProvider {
  constructor() {
    this.isVaultIQ = true;
    this.isMetaMask = false;
    this.chainId = null;
    this.selectedAddress = null;
    this.isConnected = false;
    this.eventListeners = new Map();
    
    console.log('✅ VaultIQ Provider initialized');
  }

  // Main EIP-1193 request method
  async request({ method, params = [] }) {
    console.log('VaultIQ Provider request:', method, params);
    
    return new Promise((resolve, reject) => {
      const messageId = 'vaultiq_' + Math.random().toString(36).substr(2, 9);
      
      // Send message to content script via postMessage
      window.postMessage({
        type: 'VAULTIQ_PAGE_REQUEST',
        messageId,
        method,
        params,
        origin: window.location.origin
      }, '*');
      
      // Listen for response from content script
      const listener = (event) => {
        if (event.source === window && 
            event.data.type === 'VAULTIQ_PAGE_RESPONSE' && 
            event.data.messageId === messageId) {
          
          window.removeEventListener('message', listener);
          
          if (event.data.success) {
            // Handle different response formats
            const result = event.data.result || event.data.accounts || event.data.chainId || event.data.data;
            resolve(result);
          } else {
            reject(new Error(event.data.error || 'Request failed'));
          }
        }
      };
      
      window.addEventListener('message', listener);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new Error('VaultIQ request timeout - please ensure extension is unlocked'));
      }, 30000);
    });
  }

  // Convenience methods
  async getAccounts() {
    return this.request({ method: 'eth_accounts' });
  }

  async getChainId() {
    const chainId = await this.request({ method: 'eth_chainId' });
    this.chainId = chainId;
    return chainId;
  }

  async getBalance(address, blockTag = 'latest') {
    return this.request({ method: 'eth_getBalance', params: [address, blockTag] });
  }

  async sendTransaction(transactionObject) {
    return this.request({ method: 'eth_sendTransaction', params: [transactionObject] });
  }

  async personalSign(message, address) {
    return this.request({ method: 'personal_sign', params: [message, address] });
  }

  async signTypedData(address, typedData) {
    return this.request({ method: 'eth_signTypedData_v4', params: [address, typedData] });
  }

  // Event management
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    console.log('VaultIQ: Added listener for', event);
  }

  removeListener(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
        console.log('VaultIQ: Removed listener for', event);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in VaultIQ event listener:', error);
        }
      });
    }
  }

  // Legacy methods for compatibility with older dApps
  enable() {
    return this.request({ method: 'eth_requestAccounts' });
  }

  send(methodOrPayload, paramsOrCallback) {
    if (typeof methodOrPayload === 'string') {
      return this.request({ method: methodOrPayload, params: paramsOrCallback });
    } else {
      return this.request(methodOrPayload);
    }
  }

  sendAsync(payload, callback) {
    this.request(payload)
      .then(result => callback(null, { id: payload.id, result }))
      .catch(error => callback(error, null));
  }

  // Connection status
  isConnected() {
    return this.isConnected;
  }

  // Network switching
  async switchEthereumChain(chainParams) {
    return this.request({ method: 'wallet_switchEthereumChain', params: [chainParams] });
  }

  async addEthereumChain(chainParams) {
    return this.request({ method: 'wallet_addEthereumChain', params: [chainParams] });
  }
}

// Create provider instance
const vaultiqProvider = new VaultIQProvider();

// Always expose VaultIQ provider
window.vaultiq = vaultiqProvider;
console.log('✅ window.vaultiq set');

// Handle ethereum provider assignment
if (!window.ethereum) {
  // No other wallet - become default
  window.ethereum = vaultiqProvider;
  console.log('✅ VaultIQ set as default ethereum provider');
} else {
  // Other wallet exists - for testing, you can override by uncommenting:
  // window.ethereum = vaultiqProvider;
  console.log('⚠️ Other ethereum provider detected:', window.ethereum.constructor?.name || 'Unknown');
  console.log('✅ VaultIQ available as window.vaultiq');
}

// EIP-6963 Wallet Discovery Standard
try {
  const providerInfo = {
    uuid: crypto.randomUUID(),
    name: 'VaultIQ',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iMTIiIGZpbGw9IiMwMDY2Q0MiLz4KPHA+PHBhdGggZD0iTTI0IDEyTDI4IDIySDM2TDI4IDMwTDI0IDQwTDIwIDMwTDEyIDIySDIwTDI0IDEyWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+',
    rdns: 'com.vaultiq.wallet'
  };

  const announceEvent = new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: providerInfo,
      provider: vaultiqProvider
    }
  });
  
  // Announce provider
  window.dispatchEvent(announceEvent);
  console.log('✅ EIP-6963 provider announced');
  
  // Listen for discovery requests
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: providerInfo,
        provider: vaultiqProvider
      }
    }));
    console.log('✅ Responded to EIP-6963 discovery request');
  });
  
} catch (error) {
  console.warn('EIP-6963 announcement failed:', error);
}

// Legacy ethereum initialization events
try {
  window.dispatchEvent(new Event('ethereum#initialized'));
  console.log('✅ Legacy ethereum#initialized event dispatched');
} catch (error) {
  console.warn('Legacy event dispatch failed:', error);
}

// Initialize connection state check
setTimeout(async () => {
  try {
    const accounts = await vaultiqProvider.getAccounts();
    if (accounts && accounts.length > 0) {
      vaultiqProvider.selectedAddress = accounts[0];
      vaultiqProvider.isConnected = true;
      vaultiqProvider.emit('connect', { chainId: vaultiqProvider.chainId });
    }
  } catch (error) {
    console.log('No existing connection found');
  }
}, 1000);

console.log('🎉 VaultIQ Provider injection complete!');
console.log('Test - window.ethereum:', !!window.ethereum);
console.log('Test - window.vaultiq:', !!window.vaultiq);
console.log('Test - ethereum.isVaultIQ:', window.ethereum?.isVaultIQ);

// Mark injection as completed
window.vaultiqInjected = true;