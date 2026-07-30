const { normalizeQueryResult } = require('./lambda/parseModelJson');

const raw = [
  '```json',
  '{',
  '  "answer": "Hello world",',
  '  "references": [{"path":"a.js","snippet":"x"}],',
  '  "suggestedQuestions": ["q1"],',
  '  "confidence": 0.85',
  '}',
  '```',
].join('\n');

const r = normalizeQueryResult(null, raw);
console.log(JSON.stringify(r, null, 2));
if (r.answer !== 'Hello world') {
  console.error('FAIL answer');
  process.exit(1);
}
if (r.confidence !== 0.85) {
  console.error('FAIL confidence');
  process.exit(1);
}
console.log('PARSE_OK');
