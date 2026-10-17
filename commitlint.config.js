import { messageViolations } from './scripts/lib/commitPolicy.ts';

export default {
    defaultIgnores: false,
    extends: ['@commitlint/config-conventional'],
    plugins: [
        {
            rules: {
                'repository-attribution': parsed => {
                    const findings = messageViolations(parsed.raw);
                    return [findings.length === 0, findings.join('; ')];
                },
            },
        },
    ],
    rules: { 'repository-attribution': [2, 'always'], 'body-max-line-length': [0], 'footer-max-line-length': [0] },
};
