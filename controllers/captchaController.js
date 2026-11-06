import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Generates a stateless alphanumeric SVG CAPTCHA
 */
const generateCaptchaSVG = (text) => {
  const width = 150;
  const height = 50;
  const chars = text.split("");
  
  // Random noise (lines and points)
  let noise = "";
  for (let i = 0; i < 6; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,0.1)" stroke-width="1" />`;
  }
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = Math.random() * 1.5;
    noise += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(0,0,0,0.1)" />`;
  }

  // Render characters with rotation and variation
  const charElements = chars.map((char, i) => {
    const x = 20 + i * 20;
    const y = 35;
    const rotate = (Math.random() - 0.5) * 45; // -22.5 to 22.5 degrees
    const fontSize = 28 + Math.random() * 8;
    const color = `hsl(${Math.random() * 360}, 50%, 30%)`;
    return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-weight="900" font-size="${fontSize}" fill="${color}" transform="rotate(${rotate}, ${x}, ${y})">${char}</text>`;
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f8fafc" rx="8" />
    ${noise}
    ${charElements}
  </svg>`;
};

/**
 * Endpoint to fetch a new CAPTCHA challenge
 */
export const getCaptcha = async (req, res) => {
  try {
    // Generate 6 random alphanumeric characters (UC)
    const captchaText = crypto.randomBytes(3).toString('hex').toUpperCase(); 
    
    // Hash the captcha text with secret to create a stateless verification token
    const hash = crypto.createHmac('sha256', process.env.JWT_SECRET)
                       .update(captchaText)
                       .digest('hex');

    // Create a JWT valid for 2 minutes
    const captchaToken = jwt.sign(
      { expectedHash: hash }, 
      process.env.JWT_SECRET, 
      { expiresIn: '2m' }
    );

    const svg = generateCaptchaSVG(captchaText);

    res.json({
      success: true,
      image: svg,
      captchaToken: captchaToken
    });
  } catch (error) {
    console.error("Captcha generation error:", error);
    res.status(500).json({ success: false, message: "Failed to generate CAPTCHA" });
  }
};
