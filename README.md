# Mundo Squishy

Brincadeira em 3D com **Three.js** + **Vite**: uma bola squishie que dá para apertar, arrastar e arremessar, com a Mamá, o Kike, o Eric ou o Theo, na praia no Brasil ou na neve no Canadá.

**Stack:** Three.js (WebGL) · Vite · JavaScript puro · Web Audio API (sons sintetizados) · GitHub Pages

## Rodar localmente

```bash
npm install
npm run dev
```

Abre em http://localhost:5173

## Telas

1. **Início:** logo *Mundo Squishy* com **Jogar**, **Personagens** e **Cenários**. A bola fica livre no meio da tela.
2. **Personagens:** Mamá, Kike, Eric e Theo.
3. **Cenários:** Brasil (praia com coqueiros, mar e morros) ou Canadá (pinheiros, montanhas, boneco de neve e neve caindo).
4. **Jogo:** **Menu** (ou `Esc`) volta ao início; o botão verde troca de cenário na hora; o botão de alto-falante liga/desliga o som.

As escolhas ficam salvas no navegador para a próxima visita.

## Como brincar

- **Computador:** a personagem segue o mouse. Clique e segure **na bola** para apertar; arraste segurando para levar a bola e solte em movimento para arremessar. Arrastar fora da bola gira a câmera; a rodinha dá zoom.
- **Celular:** toque e segure na bola para apertar; arraste o dedo para levar a bola. Ao soltar, a personagem volta para o lugar dela, em pé, segurando a bola por baixo.

A dica de como jogar fica sempre visível no rodapé.

## Física da bola

Cada quadro deforma uma esfera subdividida (≈7.800 vértices) somando várias camadas:

- **Ondas na superfície:** cada vértice tem uma mola radial ligada aos vizinhos (equação de onda discreta). Apertos e batidas "cutucam" a superfície e as ondas se espalham.
- **Afundamento das mãos** com um **bojo** em volta (o material empurrado sobe ao redor dos dedos).
- **Achatamento com volume conservado** ao longo do eixo do aperto, mais um **balanço de gelatina** num eixo perpendicular quando você solta.
- **Achatamento de impacto** no chão e nas paredes invisíveis, e **esticar** na direção do movimento.
- Gravidade, quique, atrito de rolamento e **rolagem** coerente com o deslocamento.

## Personagens

As imagens de cursor têm a mesma geometria: 300×360 (2×), com o ponto entre as mãos em (150, 60).
Fotos recortadas em `public/characters/`: `<nome>-open.png` (mãos abertas), `<nome>-closed.png` (mãos juntas) e `<nome>.png` (retrato do card). As da Mamá ficam em `public/cursor/`. Para adicionar alguém, siga o mesmo formato e acrescente uma entrada em `src/characters.js`.

## Estrutura

```
src/main.js        cena, câmera, personagem-cursor e interação
src/ball.js        malha deformável e física da bola
src/scenes.js      cenários Brasil e Canadá
src/characters.js  lista de personagens e cenários
src/ui.js          menus, HUD e preferências salvas
src/audio.js       sons de aperto, "boing" e batidas
```

## Publicação (GitHub Pages)

O workflow `.github/workflows/pages.yml` gera o build e publica a cada push na `main` (ou manualmente na aba Actions).
Configuração única: **Settings → Pages → Source: GitHub Actions**.
Link público: `https://kimciddev.github.io/ball-sample-threejs/`

## Build de produção

```bash
npm run build
npm run preview   # http://localhost:4173
```
