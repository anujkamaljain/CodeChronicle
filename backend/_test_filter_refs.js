const { filterReferencesToContext } = require('./lambda/parseModelJson');

const relevant = [
  { path: 'src/components/sections/Stories.tsx' },
  { path: 'src/app/page.tsx' },
];

const refs = [
  { path: 'extension/src/extension.js', snippet: 'hallucinated' },
  { path: 'src/components/sections/Stories.tsx', snippet: 'real' },
  { path: 'Stories.tsx', snippet: 'basename' },
];

const out = filterReferencesToContext(refs, relevant);
console.log(JSON.stringify(out, null, 2));
if (out.length !== 2) process.exit(1);
if (out.some((r) => r.path.includes('extension/'))) process.exit(1);
console.log('FILTER_OK');
