import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { STORAGE_KEYS, DEFAULT_PASSWORD } from '../utils/constants'

const useWallet = () => {
  const [wallet, setWallet] = useState(null)
  const [hasWallet, setHasWallet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isUnlocked, setIsUnlocked] = useState(false)

  useEffect(() => {
    checkWalletExists()
  }, [])

  // Helper to store in both localStorage and chrome.storage.local
  const setStorageItem = async (key, value) => {
    // Store in localStorage for popup
    localStorage.setItem(key, value)
    
    // Store in chrome.storage.local for background script
    try {
      await chrome.storage.local.set({ [key]: value })
    } catch (error) {
      console.warn('Chrome storage not available:', error)
    }
  }

  // Helper to get from both storage systems
  const getStorageItem = async (key) => {
    // Try chrome.storage.local first
    try {
      const result = await chrome.storage.local.get([key])
      if (result[key]) return result[key]
    } catch (error) {
      console.warn('Chrome storage not available:', error)
    }
    
    // Fallback to localStorage
    return localStorage.getItem(key)
  }

  const checkWalletExists = async () => {
    try {
      const walletData = await getStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET)
      setHasWallet(!!walletData)
    } catch (error) {
      console.error('Error checking wallet:', error)
      setHasWallet(false)
    } finally {
      setLoading(false)
    }
  }

  const unlockWallet = async (password = DEFAULT_PASSWORD) => {
    try {
      const encryptedWallet = await getStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET)
      
      if (!encryptedWallet) {
        throw new Error('No wallet found')
      }

      const decryptedWallet = await ethers.Wallet.fromEncryptedJson(
        encryptedWallet, 
        password
      )
      
      setWallet(decryptedWallet)
      setIsUnlocked(true)
      return decryptedWallet
    } catch (error) {
      console.error('Error unlocking wallet:', error)
      throw new Error('Invalid password')
    }
  }

  const createWallet = async (password = DEFAULT_PASSWORD) => {
    try {
      const newWallet = ethers.Wallet.createRandom()
      const encryptedWallet = await newWallet.encrypt(password)
      
      // Store in both storage systems
      await setStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET, encryptedWallet)
      await setStorageItem(STORAGE_KEYS.HAS_WALLET, 'true')
      await setStorageItem(STORAGE_KEYS.WALLET_ADDRESS, newWallet.address)
      
      // Also store the flag that background script expects
      await setStorageItem('has_wallet', true)
      await setStorageItem('wallet_address', newWallet.address)
      
      setWallet(newWallet)
      setHasWallet(true)
      setIsUnlocked(true)
      
      return {
        wallet: newWallet,
        mnemonic: newWallet.mnemonic.phrase
      }
    } catch (error) {
      console.error('Error creating wallet:', error)
      throw error
    }
  }

  const importWallet = async (mnemonic, password = DEFAULT_PASSWORD) => {
    try {
      const importedWallet = ethers.Wallet.fromMnemonic(mnemonic.trim())
      const encryptedWallet = await importedWallet.encrypt(password)
      
      // Store in both storage systems
      await setStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET, encryptedWallet)
      await setStorageItem(STORAGE_KEYS.HAS_WALLET, 'true')
      await setStorageItem(STORAGE_KEYS.WALLET_ADDRESS, importedWallet.address)
      
      // Also store the flag that background script expects
      await setStorageItem('has_wallet', true)
      await setStorageItem('wallet_address', importedWallet.address)
      
      setWallet(importedWallet)
      setHasWallet(true)
      setIsUnlocked(true)
      
      return importedWallet
    } catch (error) {
      console.error('Error importing wallet:', error)
      throw new Error('Invalid mnemonic phrase')
    }
  }

  return {
    wallet,
    hasWallet,
    loading,
    isUnlocked,
    unlockWallet,
    createWallet,
    importWallet
  }
}

export default useWallet