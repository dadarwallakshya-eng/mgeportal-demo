const sharp = require('sharp');

sharp('public/logo.jpg')
  .metadata()
  .then(meta => {
    console.log('Logo metadata:', meta);
  })
  .catch(err => {
    console.error(err);
  });
