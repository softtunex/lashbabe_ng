/**
 * Webpack configuration for Strapi admin customization
 * This file helps Strapi recognize and load custom admin files
 */

'use strict';

module.exports = (config, webpack) => {
  // Add custom alias for easier imports
  config.resolve.alias = {
    ...config.resolve.alias,
    '@admin': __dirname,
  };

  // Ensure proper handling of image imports
  config.module.rules.push({
    test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
    type: 'asset/resource',
  });

  return config;
};
