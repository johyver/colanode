import { useMemo } from 'react';

import { FormulaFieldAttributes, FieldValue } from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecord } from '@colanode/ui/contexts/record';

interface RecordFormulaValueProps {
  field: FormulaFieldAttributes;
}

const scalarValue = (value: FieldValue | undefined): string | number => {
  if (!value) return '';
  if (value.type === 'number') return value.value;
  if (value.type === 'boolean') return value.value ? 1 : 0;
  if (value.type === 'string_array') return value.value.join(', ');
  return value.value;
};

const evaluateNumber = (expression: string): number | null => {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) return null;

  let index = 0;
  const parseExpression = (): number => {
    let value = parseTerm();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const next = parseTerm();
      value = operator === '+' ? value + next : value - next;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const next = parseFactor();
      value = operator === '*' ? value * next : next === 0 ? NaN : value / next;
    }
    return value;
  };
  const parseFactor = (): number => {
    if (tokens[index] === '-') {
      index += 1;
      return -parseFactor();
    }
    if (tokens[index] === '(') {
      index += 1;
      const value = parseExpression();
      if (tokens[index] !== ')') throw new Error('Unbalanced formula');
      index += 1;
      return value;
    }
    const value = Number(tokens[index++]);
    if (Number.isNaN(value)) throw new Error('Invalid formula');
    return value;
  };

  try {
    const result = parseExpression();
    return index === tokens.length && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
};

export const RecordFormulaValue = ({
  field,
}: RecordFormulaValueProps) => {
  const record = useRecord();
  const database = useDatabase();

  const result = useMemo(() => {
    const expression = field.expression?.trim();
    if (!expression) return null;

    const references = expression.match(/\{\{\s*([^}]+?)\s*\}\}/g) ?? [];
    const values = new Map<string, string | number>();
    for (const reference of references) {
      const key = reference.slice(2, -2).trim();
      const target =
        key.toLowerCase() === 'name'
          ? undefined
          : database.fields.find(
              (candidate) =>
                candidate.id === key || candidate.name.toLowerCase() === key.toLowerCase()
            );
      values.set(
        reference,
        target ? scalarValue(record.fields[target.id]) : key.toLowerCase() === 'name' ? record.name : ''
      );
    }

    const resolved = expression.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (reference) => {
      const value = values.get(reference) ?? '';
      return typeof value === 'number' ? String(value) : JSON.stringify(value);
    });
    if (resolved.includes('&')) {
      return resolved
        .split('&')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .join('');
    }

    const numericExpression = resolved.replace(/"[^"]*"|'[^']*'/g, '0');
    return evaluateNumber(numericExpression);
  }, [database.fields, field.expression, record.fields, record.name]);

  if (result === null || result === '') return <span>—</span>;
  return <span>{typeof result === 'number' && !Number.isInteger(result) ? result.toFixed(2) : result}</span>;
};
