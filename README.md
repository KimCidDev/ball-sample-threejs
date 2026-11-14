# Squishie 3D

**Three.js** + **Vite** project: a squishy ball with simple physics, squeezed by a cursor shaped like a girl.

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## How to play

**Desktop (mouse)**
- The girl follows the mouse, and her arms always aim at the ball.
- Click and hold **on the ball**: she closes her hands and squeezes it. The longer you hold, the more the ball flattens and dents.
- Release: the ball wobbles like jelly and gives a little hop.
- Drag outside the ball to rotate the camera. Use the scroll wheel to zoom.

**Mobile (touch)**
- **Drag the girl** (touch on her and move) to bring her to the ball.
- **Touch and hold anywhere else on the screen** to squeeze the ball at the spot where her hands are.

## Physics

- Deformable mesh (subdivided icosahedron) recalculated every frame.
- Damped springs drive the squeeze (volume-preserving flattening along the squeeze axis), the hand dent, and the squash on floor impacts.
- Gravity, floor collision with bounce, and soft shadows.

## Cursor assets

`public/cursor/girl-open.png` and `girl-closed.png`: background-removed cutouts at 2× resolution (300×360), with the hotspot between the hands at (150, 60).

## Production build

```bash
npm run build
npm run preview   # http://localhost:4173
```
