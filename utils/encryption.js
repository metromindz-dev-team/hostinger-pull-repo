import CryptoJS from "crypto-js";
import dotenv from "dotenv";

dotenv.config();

const SECRET_KEY = process.env.ENCRYPTION_KEY;

if (!SECRET_KEY) {
  console.error("⚠️ ENCRYPTION_KEY is missing in environment variables. Encryption will fail.");
}

/**
 * Encrypts a given text using AES-256.
 * @param {string} text - The plaintext to encrypt.
 * @returns {string} - The encrypted ciphertext.
 */
export const encrypt = (text) => {
  if (!text) return text;
  try {
    return CryptoJS.AES.encrypt(String(text), SECRET_KEY).toString();
  } catch (error) {
    console.error("Encryption error:", error);
    return text;
  }
};

/**
 * Decrypts a given ciphertext using AES-256.
 * @param {string} ciphertext - The encrypted text to decrypt.
 * @returns {string} - The decrypted plaintext.
 */
export const decrypt = (ciphertext) => {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
  
  let currentText = ciphertext;
  let attempts = 0;
  
  // Recursively decrypt if the data was multi-encrypted 
  // (happens when the UI saves data that was already encrypted)
  while (currentText.startsWith('U2FsdGVkX1') && attempts < 10) {
    try {
      const bytes = CryptoJS.AES.decrypt(currentText, SECRET_KEY);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!originalText || originalText === currentText) {
        break;
      }
      currentText = originalText;
    } catch (error) {
      break;
    }
    attempts++;
  }
  
  return currentText;
};
