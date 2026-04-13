import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/imc-prosperity-4-visualizer/';

  return {
    plugins: [react()],
    base: basePath,
    build: {
      minify: false,
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4174',
          changeOrigin: true,
        },
      },
    },
  };
});
