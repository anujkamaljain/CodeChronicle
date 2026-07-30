/**
 * Parse model output that should be JSON.
 * Nova 2+ models often wrap JSON in ```json fences; older models returned raw JSON.
 */
function parseModelJson(text, fallback) {
    if (typeof text !== 'string' || !text.trim()) {
        return fallback;
    }

    const trimmed = text.trim();

    const tryParse = (candidate) => {
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    };

    let parsed = tryParse(trimmed);
    if (parsed) return parsed;

    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        parsed = tryParse(fence[1].trim());
        if (parsed) return parsed;
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
        parsed = tryParse(trimmed.slice(start, end + 1));
        if (parsed) return parsed;
    }

    return fallback;
}

/**
 * Normalize AI query payloads so nested/fenced JSON doesn't leak into `answer`.
 */
function normalizeQueryResult(result, rawText) {
    const fallback = {
        answer: typeof rawText === 'string' ? rawText.trim() : '',
        references: [],
        suggestedQuestions: [],
        confidence: 0.5,
    };

    let parsed = result && typeof result === 'object' ? result : null;
    if (!parsed) {
        parsed = parseModelJson(rawText, fallback);
    }

    // If parse produced a nested shape inside answer, unwrap once.
    if (parsed && typeof parsed.answer === 'string') {
        const nested = parseModelJson(parsed.answer, null);
        if (
            nested &&
            typeof nested === 'object' &&
            typeof nested.answer === 'string' &&
            (Array.isArray(nested.references) || Array.isArray(nested.suggestedQuestions))
        ) {
            parsed = nested;
        }
    }

    if (!parsed || typeof parsed !== 'object' || typeof parsed.answer !== 'string') {
        return fallback;
    }

    return {
        answer: parsed.answer,
        references: Array.isArray(parsed.references) ? parsed.references : [],
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
}

function normalizePathKey(p) {
    return String(p || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .trim();
}

/**
 * Keep only references that match files provided in the request context.
 * Drops hallucinated paths (e.g. from another project or model memory).
 */
function filterReferencesToContext(references, relevantFiles) {
    if (!Array.isArray(references) || references.length === 0) return [];

    const allowed = (Array.isArray(relevantFiles) ? relevantFiles : [])
        .map((f) => normalizePathKey(f?.path || f))
        .filter(Boolean);

    if (allowed.length === 0) return [];

    const allowedLower = allowed.map((p) => p.toLowerCase());
    const byBasename = new Map();
    for (const p of allowed) {
        const base = p.split('/').pop().toLowerCase();
        if (!byBasename.has(base)) byBasename.set(base, []);
        byBasename.get(base).push(p);
    }

    const resolveAllowed = (rawPath) => {
        const target = normalizePathKey(rawPath);
        if (!target) return null;

        const exact = allowed.find((p) => p === target);
        if (exact) return exact;

        const lower = target.toLowerCase();
        const ciIdx = allowedLower.indexOf(lower);
        if (ciIdx !== -1) return allowed[ciIdx];

        const suffix = allowed.find((p) => {
            const pl = p.toLowerCase();
            return pl.endsWith('/' + lower) || pl === lower;
        });
        if (suffix) return suffix;

        const base = target.split('/').pop().toLowerCase();
        const matches = byBasename.get(base) || [];
        if (matches.length === 1) return matches[0];

        return null;
    };

    const filtered = [];
    for (const ref of references) {
        if (!ref || typeof ref !== 'object') continue;
        const resolved = resolveAllowed(ref.path);
        if (!resolved) continue;
        filtered.push({
            ...ref,
            path: resolved,
            snippet: typeof ref.snippet === 'string' ? ref.snippet : '',
        });
    }
    return filtered;
}

module.exports = {
    parseModelJson,
    normalizeQueryResult,
    filterReferencesToContext,
};
