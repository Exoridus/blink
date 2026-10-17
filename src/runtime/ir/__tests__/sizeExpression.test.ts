import { describe, expect, it } from 'vitest';

import {
    clampDimension,
    collectControlRefs,
    evaluateSizeExpression,
    formatSizeExpression,
    parseSizeExpression,
    SizeExpressionError,
} from '../sizeExpression';

const env = { width: 1920, height: 1080, controls: { scale: 0.5, flip: true, off: false } };

function run(source: string, e = env): number {
    return evaluateSizeExpression(parseSizeExpression(source), e);
}

describe('parseSizeExpression / evaluateSizeExpression', () => {
    it('evaluates literals and the screen variables', () => {
        expect(run('64')).toBe(64);
        expect(run('0.5')).toBe(0.5);
        expect(run('1e2')).toBe(100);
        expect(run('$WIDTH')).toBe(1920);
        expect(run('$HEIGHT')).toBe(1080);
    });

    it('honours operator precedence, associativity and parentheses', () => {
        expect(run('2 + 3 * 4')).toBe(14);
        expect(run('(2 + 3) * 4')).toBe(20);
        expect(run('10 - 4 - 3')).toBe(3);
        expect(run('100 / 5 / 2')).toBe(10);
        expect(run('17 % 5')).toBe(2);
        expect(run('-3 + 5')).toBe(2);
        expect(run('2 * -3')).toBe(-6);
        expect(run('--4')).toBe(4);
    });

    it('reads numeric and bool controls', () => {
        expect(run('$WIDTH * $scale')).toBe(960);
        expect(run('$flip')).toBe(1);
        expect(run('$off')).toBe(0);
    });

    it('supports the allowed functions', () => {
        expect(run('min(3, 9, 2)')).toBe(2);
        expect(run('max(3, 9, 2)')).toBe(9);
        expect(run('floor(2.9)')).toBe(2);
        expect(run('ceil(2.1)')).toBe(3);
        expect(run('round(2.5)')).toBe(3);
        expect(run('abs(-7)')).toBe(7);
        expect(run('clamp($WIDTH / 3, 100, 500)')).toBe(500);
        expect(run('clamp(5, 100, 500)')).toBe(100);
    });

    it('is usable for typical ISF sizing', () => {
        expect(run('floor($WIDTH / 2)')).toBe(960);
        expect(run('max(1, $WIDTH * $scale / 4)')).toBe(240);
    });

    it('rejects syntax outside the language', () => {
        for (const bad of [
            '',
            '   ',
            '1 +',
            '(1 + 2',
            '1 + 2)',
            '1 2',
            'WIDTH',
            '$',
            '$1abc',
            'foo(1)',
            'min()',
            'abs(1, 2)',
            'clamp(1, 2)',
            'floor',
            'a = 3',
            '$WIDTH.length',
            '$WIDTH[0]',
            '"x"',
            'window',
            '1 ** 2',
            '0x10',
            'Infinity',
            'NaN',
            '1,2',
            '() => 1',
            '1; 2',
        ]) {
            expect(() => parseSizeExpression(bad), JSON.stringify(bad)).toThrow(SizeExpressionError);
        }
    });

    it('fails at evaluation for an unknown control or a non-finite result', () => {
        expect(() => run('$missing')).toThrow(SizeExpressionError);
        expect(() => run('1 / 0')).toThrow(SizeExpressionError);
        expect(() => run('0 % 0')).toThrow(SizeExpressionError);
        expect(() => run('1e999')).toThrow(SizeExpressionError);
    });
});

describe('collectControlRefs', () => {
    it('returns user control names but not the screen variables', () => {
        const expr = parseSizeExpression('max($WIDTH * $scale, $HEIGHT / $divisor) + $scale');
        expect([...collectControlRefs(expr)].sort()).toEqual(['divisor', 'scale']);
    });

    it('is empty for a constant expression', () => {
        expect(collectControlRefs(parseSizeExpression('floor($WIDTH / 2)')).size).toBe(0);
    });
});

describe('clampDimension', () => {
    it('floors to an integer of at least 1', () => {
        expect(clampDimension(100.9, 4096)).toBe(100);
        expect(clampDimension(0.2, 4096)).toBe(1);
        expect(clampDimension(-50, 4096)).toBe(1);
    });

    it('clamps to the backend maximum', () => {
        expect(clampDimension(99999, 4096)).toBe(4096);
    });
});

describe('parseSizeExpression literals', () => {
    it('rejects a number that overflows, which no text could represent', () => {
        expect(() => parseSizeExpression('min($WIDTH, 1e999)')).toThrow(SizeExpressionError);
    });
});

describe('formatSizeExpression', () => {
    it.each([
        '64',
        '$WIDTH / 2',
        '10 - (4 - 3)',
        '10 - 4 - 3',
        '(2 + 3) * 4',
        '2 * (3 % 2)',
        '-($WIDTH + 1)',
        '1 - -$scale',
        'max(1, floor($HEIGHT * $scale) - 4)',
        'clamp($WIDTH / 3, 8, 4096)',
        '1e21',
    ])('parses back to an equal tree: %s', source => {
        const tree = parseSizeExpression(source);

        expect(parseSizeExpression(formatSizeExpression(tree))).toEqual(tree);
    });
});
