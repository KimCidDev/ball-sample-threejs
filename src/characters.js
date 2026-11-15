// Personagens e cenários disponíveis.
// BASE_URL permite publicar em subpasta (ex.: GitHub Pages).
const BASE = import.meta.env.BASE_URL;

// Todas as imagens de cursor têm a mesma geometria: 300x360 (2x),
// com o ponto entre as mãos em (150, 60).
export const CHARACTERS = {
  mama: {
    name: 'Mamá',
    open: `${BASE}cursor/girl-open.png`,
    closed: `${BASE}cursor/girl-closed.png`,
    portrait: `${BASE}characters/mama.png`,
    color: '#ff4fa3',
  },
  kike: {
    name: 'Kike',
    open: `${BASE}characters/kike-open.png`,
    closed: `${BASE}characters/kike-closed.png`,
    portrait: `${BASE}characters/kike.png`,
    color: '#ff9a1f',
  },
  eric: {
    name: 'Eric',
    open: `${BASE}characters/eric-open.png`,
    closed: `${BASE}characters/eric-closed.png`,
    portrait: `${BASE}characters/eric.png`,
    color: '#3d8bff',
  },
  theo: {
    name: 'Theo',
    open: `${BASE}characters/theo-open.png`,
    closed: `${BASE}characters/theo-closed.png`,
    portrait: `${BASE}characters/theo.png`,
    color: '#2fb36b',
  },
};

export const SCENARIOS = {
  brasil: { name: 'Brasil', place: 'Praia ensolarada' },
  canada: { name: 'Canadá', place: 'Inverno com neve' },
};
