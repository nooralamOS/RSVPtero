function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function allByLocalName(root, name) {
  return [...root.getElementsByTagName('*')].filter(
    (el) => el.localName === name || el.tagName === name,
  );
}

function normalizeHref(href) {
  if (!href) return '';
  return href.split('#')[0].replace(/^\.\//, '');
}

function titleFromChapterHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const h = doc.querySelector('h1, h2, h3, title');
  return h?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

export function buildSpinePaths(opfDir, spine) {
  return spine.map(({ href }) => {
    const parts = `${opfDir}/${href}`.split('/').filter(Boolean);
    const stack = [];
    for (const part of parts) {
      if (part === '..') stack.pop();
      else if (part !== '.') stack.push(part);
    }
    return stack.join('/');
  });
}

export function spineIndexForHref(href, spinePaths) {
  const target = normalizeHref(href);
  if (!target) return -1;
  const exact = spinePaths.findIndex((p) => p === target || p.endsWith(`/${target}`));
  if (exact >= 0) return exact;
  return spinePaths.findIndex((p) => p.endsWith(target) || target.endsWith(p));
}

function parseNavToc(navHtml, opfDir) {
  const doc = new DOMParser().parseFromString(navHtml, 'text/html');
  const tocNav =
    [...doc.querySelectorAll('nav')].find((n) => {
      const type = n.getAttribute('epub:type') || n.getAttribute('type') || '';
      return type.includes('toc') || n.id === 'toc';
    }) || doc.querySelector('nav');
  if (!tocNav) return [];

  return [...tocNav.querySelectorAll('a[href]')]
    .map((a) => ({
      href: a.getAttribute('href'),
      label: a.textContent?.replace(/\s+/g, ' ').trim(),
    }))
    .filter((e) => e.href && e.label);
}

function parseNcxToc(ncxXml) {
  const doc = parseXml(ncxXml);
  return allByLocalName(doc, 'navPoint')
    .map((np) => {
      const label = allByLocalName(np, 'text')[0]?.textContent?.replace(/\s+/g, ' ').trim();
      const src = allByLocalName(np, 'content')[0]?.getAttribute('src');
      return { href: src, label };
    })
    .filter((e) => e.href && e.label);
}

export async function extractEpubToc(zip, opfDoc, opfDir, manifest, spine, spinePaths, chapterHtmlByIndex) {
  const tocEntries = [];

  const navItem = [...manifest.values()].find((item) => {
    const props = item.properties || '';
    return props.includes('nav') || /nav/i.test(item.href || '');
  });
  if (navItem) {
    const navPath = buildSpinePaths(opfDir, [{ href: navItem.href }])[0];
    const navHtml = await zip.file(navPath)?.async('string');
    if (navHtml) tocEntries.push(...parseNavToc(navHtml, opfDir));
  }

  const ncxItem = [...manifest.values()].find(
    (item) => item.mediaType === 'application/x-dtbncx+xml',
  );
  if (ncxItem && tocEntries.length === 0) {
    const ncxPath = buildSpinePaths(opfDir, [{ href: ncxItem.href }])[0];
    const ncxXml = await zip.file(ncxPath)?.async('string');
    if (ncxXml) tocEntries.push(...parseNcxToc(ncxXml));
  }

  const labelsBySpine = new Array(spine.length).fill('');
  for (const entry of tocEntries) {
    const idx = spineIndexForHref(entry.href, spinePaths);
    if (idx >= 0 && !labelsBySpine[idx]) labelsBySpine[idx] = entry.label;
  }

  for (let i = 0; i < spine.length; i++) {
    if (labelsBySpine[i]) continue;
    const fromHtml = titleFromChapterHtml(chapterHtmlByIndex[i] || '');
    if (fromHtml) labelsBySpine[i] = fromHtml;
  }

  return labelsBySpine;
}
