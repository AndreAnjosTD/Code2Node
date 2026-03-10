import { toPng, toSvg } from 'html-to-image';

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getGraphElement(): HTMLElement {
  const el = document.querySelector('.react-flow') as HTMLElement | null;
  if (!el) {
    throw new Error('Graph element not found. Scan a project first.');
  }
  return el;
}

export async function downloadGraphPng(): Promise<void> {
  const element = getGraphElement();
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#0a0e1a',
  });
  downloadDataUrl(dataUrl, `code2node-graph-${timestamp()}.png`);
}

export async function downloadGraphSvg(): Promise<void> {
  const element = getGraphElement();
  const dataUrl = await toSvg(element, {
    cacheBust: true,
    backgroundColor: '#0a0e1a',
  });
  downloadDataUrl(dataUrl, `code2node-graph-${timestamp()}.svg`);
}
