import { readFileSync, writeFileSync } from 'node:fs';

const products = [
  { id: 'people', page: 'people.html' },
  { id: 'work', page: 'work.html' },
  { id: 'ld', page: 'demo/ld.html' },
];

for (const { id, page } of products) {
  const source = readFileSync(page, 'utf8');
  const logo = readFileSync('demo/brand/' + id + '.svg', 'utf8').trim();
  let html;
  if (id === 'ld') {
    let replaced = 0;
    html = source.replace(/<svg\b[^>]*aria-label="all hands L&amp;D"[^>]*>[\s\S]*?<\/svg>/g, original => {
      replaced++;
      return original.includes('role="presentation"')
        ? logo.replaceAll('ld-side-', 'ld-mobile-').replace('role="img"', 'role="presentation"')
        : logo;
    });
    if (replaced !== 2) throw new Error('Expected desktop and mobile L&D wordmarks');
  } else {
    const configLine = /^(\s*const config=)(\{[^\n]*\});/m;
    const match = source.match(configLine);
    if (!match) throw new Error('Missing product navigation in ' + page);
    const config = JSON.parse(match[2]);
    if (config.product.toLowerCase() !== id || !config.logo) throw new Error('Unexpected product logo in ' + page);
    config.logo = logo;
    html = source.replace(configLine, () => match[1] + JSON.stringify(config).replaceAll('<', '\\u003c') + ';');
  }

  const assetBase = 'https://allhands-operations.vercel.app/demo/brand/';
  const card = assetBase + id + '-card.jpg' + (id === 'ld' ? '' : '?v=3');
  const oldHead = html.slice(0, html.indexOf('</head>'));
  const head = oldHead
    .replace(/(<meta (?:property|name)="(?:og:image(?::secure_url)?|twitter:image)" content=")[^"]+"/g, '$1' + card + '"')
    .replace(/(<link rel="image_src" href=")[^"]+"/g, '$1' + card + '"');
  if (!head.includes('property="og:image" content="' + card + '"')) throw new Error('Missing share image in ' + page);
  html = head + html.slice(oldHead.length);
  writeFileSync(page, html);
}
