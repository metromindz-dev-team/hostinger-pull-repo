import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "metromindz_dam_9922_secure_key";

export const encrypt = (text) => {
    if (!text) return "";
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
};

export const decrypt = (cipherText) => {
    if (!cipherText) return "";
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText || cipherText; // Return original if decryption results in empty (e.g. not encrypted)
    } catch (error) {
        return cipherText; // Fallback to original text if decryption fails
    }
};
