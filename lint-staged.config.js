export default {
    '*.{ts,mts,js,mjs}': ['eslint --fix', 'prettier --write --ignore-unknown'],
    '*.{css,scss}': ['stylelint --fix', 'prettier --write'],
    '*.{json,md,yml,yaml,html}': ['prettier --write --ignore-unknown'],
};
