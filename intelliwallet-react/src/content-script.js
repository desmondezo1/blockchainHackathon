// VaultIQ Content Script - CSP-Compatible Injection
console.log('VaultIQ Content Script: Starting CSP-compatible injection...');

let currentURL = window.location.href;
let vaultiqObserver = null;

// CSP-compatible injection using external script file
function injectProviderScript() {
  try {
    if (window.vaultiqInjected || document.querySelector('#vaultiq-provider-script')) {
      console.log('VaultIQ provider already injected');
      return;
    }

    const script = document.createElement('script');
    script.id = 'vaultiq-provider-script';
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function () {
      console.log('✅ VaultIQ provider script loaded successfully');
      setTimeout(() => {
        this.remove?.();
        console.log('✅ Provider script tag cleaned up');
      }, 100);
    };
    script.onerror = function () {
      console.error('❌ Failed to load VaultIQ provider script');
    };

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(script);
      console.log('✅ VaultIQ provider script injected into DOM');
    } else {
      console.error('❌ No injection target found (head or documentElement)');
    }

  } catch (error) {
    console.error('❌ VaultIQ injection failed:', error);
  }
}

// Message bridge between injected page script and extension background
function setupMessageBridge() {
  console.log('Setting up VaultIQ message bridge...');

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data.type !== 'VAULTIQ_PAGE_REQUEST') return;

    const { messageId, method, params, origin } = event.data;
    console.log('Content Script received request:', method, params);

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: method,
            params,
            origin: origin || window.location.origin,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Chrome runtime error:', chrome.runtime.lastError);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { success: false, error: 'No response from background script' });
            }
          }
        );
      });

      window.postMessage(
        {
          type: 'VAULTIQ_PAGE_RESPONSE',
          messageId,
          success: response?.success !== false,
          result: response?.result || response?.accounts || response?.chainId || response,
          error: response?.success === false ? response.error : null,
        },
        '*'
      );

    } catch (error) {
      console.error('Content script message handling error:', error);
      window.postMessage(
        {
          type: 'VAULTIQ_PAGE_RESPONSE',
          messageId,
          success: false,
          error: error.message || 'Content script error',
        },
        '*'
      );
    }
  });

  console.log('✅ VaultIQ message bridge established');
}

// Multi-stage injection strategy
function performInjection() {
  console.log('VaultIQ: Performing injection...');
  injectProviderScript();
  setupMessageBridge();
}

// Wait for DOM and perform injection
function waitForDOM() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performInjection);
  } else {
    performInjection();
  }
}

// Monitor for page changes (SPA support)
function monitorSPA() {
  vaultiqObserver = new MutationObserver(() => {
    if (window.location.href !== currentURL) {
      currentURL = window.location.href;
      console.log('VaultIQ: Page navigation detected, re-checking injection...');
      setTimeout(() => {
        if (!window.vaultiqInjected && !document.querySelector('#vaultiq-provider-script')) {
          console.log('VaultIQ: Re-injecting after navigation...');
          performInjection();
        }
      }, 500);
    }
  });

  const observe = () => {
    if (document.body) {
      vaultiqObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          vaultiqObserver.observe(document.body, { childList: true, subtree: true });
        }
      });
    }
  };

  observe();
}

// Final setup
waitForDOM();
monitorSPA();

// Backup injection
setTimeout(() => {
  if (!window.vaultiqInjected && !document.querySelector('#vaultiq-provider-script')) {
    console.log('VaultIQ: Backup injection attempt...');
    injectProviderScript();
  }
}, 1000);

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  vaultiqObserver?.disconnect();
});

console.log('VaultIQ Content Script: Setup complete');
