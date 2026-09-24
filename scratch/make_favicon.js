const sharp = require('sharp');
const fs = require('fs');

async function createFavicon() {
  try {
    console.log('Generating rounded favicon...');

    // 1. Load the original logo
    const logoMetadata = await sharp('public/logo.jpg').metadata();
    const minDim = Math.min(logoMetadata.width, logoMetadata.height); // should be 394
    
    // 2. Crop to center square
    const croppedLogo = await sharp('public/logo.jpg')
      .extract({
        left: Math.round((logoMetadata.width - minDim) / 2),
        top: Math.round((logoMetadata.height - minDim) / 2),
        width: minDim,
        height: minDim
      })
      .resize(460, 460) // Scale up the logo to fill more space
      .png()
      .toBuffer();

    // 3. Create a white 512x512 canvas
    const whiteBg = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite([{ input: croppedLogo, gravity: 'center' }])
    .png()
    .toBuffer();

    // 4. Create rounded mask (rx=80 for a modern premium rounded corner)
    const mask = Buffer.from(
      `<svg width="512" height="512">
        <rect x="0" y="0" width="512" height="512" rx="80" ry="80" fill="white" />
      </svg>`
    );

    // 5. Apply rounded corners mask
    const roundedImage = await sharp(whiteBg)
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    // 6. Save outputs
    // 512x512 PNG
    await sharp(roundedImage).toFile('public/icon.png');
    // 180x180 Apple Touch Icon
    await sharp(roundedImage).resize(180, 180).toFile('public/apple-touch-icon.png');
    // 32x32 Favicon PNG
    await sharp(roundedImage).resize(32, 32).toFile('public/favicon.png');

    console.log('Successfully generated rounded favicon assets!');
  } catch (error) {
    console.error('Error generating favicon:', error);
  }
}

createFavicon();
