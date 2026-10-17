export function stripGlslPreamble(source: string): string {
    return source
        .replace(/^\s*#version\s+300\s+es\s*\n/, '')
        .replace(/^\s*precision\s+\w+\s+float\s*;\s*\n/, '')
        .replace(/^\s*out\s+vec4\s+fragColor\s*;\s*\n/, '');
}
