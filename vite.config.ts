import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true, // يسمح بفتح الصفحة من الهاتف على نفس شبكة الواي فاي
  },
});
