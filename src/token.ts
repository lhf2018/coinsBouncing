export const tokenFont = '800 22px system-ui';
export const maxTokenGrowth = .28;

let context: CanvasRenderingContext2D;

export function tokenRadius(text: string) {
  context ??= document.createElement('canvas').getContext('2d')!;
  context.font = tokenFont;
  const bounds = context.measureText(text);
  const width = bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight;
  const height = bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent;
  return (Math.hypot(width, height) / 2 * (1 + maxTokenGrowth) + 4) / 30;
}
