// Palette épurée, réutilisée pour timelines et événements (pensée pour le fond sombre).
export const PALETTE = [
  '#35d0a5', // émeraude
  '#ff7a66', // corail
  '#8b9dff', // bleuet
  '#f4c15b', // ambre
  '#e879f9', // magenta
  '#60a5fa', // ciel
  '#f472b6', // rose
  '#a3e635', // citron
  '#22d3ee', // cyan
  '#c4b5fd', // lavande
]

export function colorForIndex(i) {
  return PALETTE[i % PALETTE.length]
}
