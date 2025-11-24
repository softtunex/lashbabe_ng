/**
 * Strapi Admin Customization
 * This file customizes the Strapi admin panel appearance and configuration
 */

// Import your custom logo
import logo from "./extensions/logo.png";
import favicon from "./extensions/favicon.ico";

const config = {
  // Replace the Strapi logo in the auth pages
  auth: {
    logo,
  },

  // Replace the favicon
  head: {
    favicon,
  },

  // Replace the Strapi logo in the main navigation
  menu: {
    logo,
  },

  // Add translations to customize text
  translations: {
    en: {
      // Auth page customization
      "Auth.form.welcome.title": "Welcome to LashBabe!",
      "Auth.form.welcome.subtitle": "Manage appointments, services & bookings",

      // Optional: Customize other text elements
      "app.components.LeftMenu.navbrand.title": "LashBabe Admin",
      "app.components.LeftMenu.navbrand.workplace": "Dashboard",

      // Customize the homepage welcome message
      "app.components.HomePage.welcome": "Welcome to LashBabe Admin Panel",
      "app.components.HomePage.welcome.again": "Welcome back!",

      // Optional: Customize other common phrases
      "Settings.application.title": "LashBabe Settings",

      "content-manager.plugin.name": "Manage Applications",
    },
  },

  // Customize the admin panel theme
  theme: {
    // LashBabe brand colors
    colors: {
      primary100: "#fce4ec",
      primary200: "#f8bbd0",
      primary500: "#e91e63",
      primary600: "#d81b60",
      primary700: "#c2185b",

      // Neutral colors for better readability
      neutral0: "#ffffff",
      neutral100: "#f5f5f5",
      neutral150: "#ededed",
      neutral200: "#dedede",
      neutral500: "#8e8e8e",
      neutral600: "#6a6a6a",
      neutral700: "#4a4a4a",
      neutral800: "#2c2c2c",
      neutral900: "#1a1a1a",

      // Danger/Success/Warning colors
      danger500: "#ee5e52",
      danger700: "#b72b1a",
      success500: "#5cb85c",
      success700: "#357a38",
      warning500: "#ffc107",
      warning700: "#d39e00",
    },
  },

  // Locales configuration
  locales: ["en"],

  // Disable video tutorials in development
  tutorials: false,

  // Disable notifications about new Strapi releases
  notifications: { releases: false },
};

const bootstrap = (app) => {
  console.log("✨ LashBabe Admin Panel Customization Loaded");

  // You can add custom logic here that runs when the admin panel loads
  // For example, adding custom routes, providers, etc.
};

export default {
  config,
  bootstrap,
};
