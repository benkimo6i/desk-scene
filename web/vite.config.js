import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://benkimo6i.github.io/desk-scene/, so the build (and
// `vite preview` of it) loads from that folder; the code reaches models and posters through
// import.meta.env.BASE_URL. The dev server stays at the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/desk-scene/' : '/',
}));
