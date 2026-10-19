// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // The fixed full-screen stage collides with the dev toolbar pill.
  devToolbar: { enabled: false },
});
