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
    open: `${BASE}characters/kike-open.svg`,
    closed: `${BASE}characters/kike-closed.svg`,
    portrait: `${BASE}characters/kike-closed.svg`,
    color: '#3d8bff',
    placeholder: true,
  },
  eric: {
    name: 'Eric',
    open: `${BASE}characters/eric-open.svg`,
    closed: `${BASE}characters/eric-closed.svg`,
    portrait: `${BASE}characters/eric-closed.svg`,
    color: '#2fb36b',
    placeholder: true,
  },
  theo: {
    name: 'Theo',
    open: `${BASE}characters/theo-open.svg`,
    closed: `${BASE}characters/theo-closed.svg`,
    portrait: `${BASE}characters/theo-closed.svg`,
    color: '#ff9a1f',
    placeholder: true,
  },
};

export const SCENARIOS = {
  brasil: { name: 'Brasil', place: 'Praia ensolarada' },
  canada: { name: 'Canadá', place: 'Inverno com neve' },
};
