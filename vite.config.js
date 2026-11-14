import { defineConfig } from 'vite';

// Caminhos relativos: o build funciona na raiz do domínio ou numa subpasta
// (ex.: https://<usuario>.github.io/ball-sample-threejs/).
export default defineConfig({
  base: './',
});
