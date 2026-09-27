// The published classic-script bundle embeds static assets because the anonymous
// host gives documents an opaque origin and does not enable CORS for local files.
const bundled = typeof PRISM_BUNDLED_ASSETS === 'undefined' ? null : PRISM_BUNDLED_ASSETS;

export async function loadText(path, signal) {
  signal?.throwIfAborted();
  if (bundled) {
    if (!Object.hasOwn(bundled, path)) throw Error(`Missing bundled asset: ${path}`);
    return bundled[path];
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    const {readFile} = await import('node:fs/promises');
    return readFile(new URL(`./${path}`, import.meta.url), {encoding: 'utf8', signal});
  }
  const response = await fetch(`./${path}`, {signal, credentials: 'omit'});
  if (!response.ok) throw Error(`Could not load ${path}.`);
  return response.text();
}

export async function loadJSON(name) {
  return JSON.parse(await loadText(`data/${name}.json`));
}
