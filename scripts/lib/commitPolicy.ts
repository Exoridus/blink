const models = /\b(?:ChatGPT|OpenAI|Codex|Claude(?: Code)?|Gemini|GPT-?\d[\w.-]*|LLM)\b/i;
const attribution =
    /\b(?:generated|written|authored|co-authored|implemented|created|assisted|powered)\s+(?:by|with|using)\b/i;
const policyFiles = new Set([
    'AGENTS.md',
    'CLAUDE.md',
    'CONTRIBUTING.md',
    'docs/development/commit-policy.md',
    'scripts/lib/commitPolicy.ts',
    'scripts/__tests__/node/commitPolicy.test.ts',
    'commitlint.config.js',
]);

export function messageViolations(message: string) {
    const findings: string[] = [];
    if (/^\s*co-authored-by\s*:/im.test(message)) findings.push('Co-author trailers are prohibited');
    if (
        models.test(message) ||
        /\b(?:generated|written|authored)\s+(?:by|with|using)\s+(?:AI|an? AI)\b/i.test(message)
    ) {
        findings.push('Model or assistant attribution is prohibited in commit and PR text');
    }
    return findings;
}

export function addedLineViolations(path: string, lines: readonly string[]) {
    if (
        policyFiles.has(path) ||
        /^(?:public\/|test\/fixtures\/|docs\/(?:archive|research|evidence|superpowers)\/)/.test(path)
    )
        return [];
    const findings: string[] = [];
    for (const line of lines) {
        if (attribution.test(line) && (models.test(line) || /\bAI\b/.test(line)))
            findings.push(`${path}: development attribution`);
        if (/^\s*co-authored-by\s*:/i.test(line)) findings.push(`${path}: co-author trailer`);
        if (/\.(?:workspace|superpowers)[/\\]/.test(line)) findings.push(`${path}: private scratch reference`);
        if (/[A-Za-z]:\\Users\\|\/Users\/|\/home\/[^/]+\//.test(line)) findings.push(`${path}: machine-specific path`);
    }
    return findings;
}

export function patchViolations(patch: string) {
    let path = '';
    const findings: string[] = [];
    for (const line of patch.split('\n')) {
        if (line.startsWith('+++ b/')) path = line.slice(6).replace(/\r$/, '');
        else if (line.startsWith('+') && !line.startsWith('+++'))
            findings.push(...addedLineViolations(path, [line.slice(1)]));
    }
    return [...new Set(findings)];
}
