import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';

import { LocalRecordNode } from '@colanode/client/types';
import {
  FieldValue,
  RelationFieldAttributes,
  RollupFieldAttributes,
} from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface RecordRollupValueProps {
  field: RollupFieldAttributes;
}

const valueForField = (
  record: LocalRecordNode,
  fieldId: string | null | undefined
): FieldValue | undefined => (fieldId ? record.fields[fieldId] : undefined);

const displayValue = (value: FieldValue | undefined): string | number => {
  if (!value) return '';
  if (value.type === 'number') return value.value;
  if (value.type === 'boolean') return value.value ? 1 : 0;
  if (value.type === 'string_array') return value.value.join(', ');
  return value.value;
};

export const RecordRollupValue = ({ field }: RecordRollupValueProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const record = useRecord();
  const relationField = database.fields.find(
    (candidate): candidate is RelationFieldAttributes =>
      candidate.id === field.relationFieldId && candidate.type === 'relation'
  );
  const relationValue = relationField ? record.fields[relationField.id] : undefined;
  const relationIds = relationValue?.type === 'string_array' ? relationValue.value : [];

  const relatedQuery = useLiveQuery(
    (q) => {
      if (relationIds.length === 0 || !relationField?.databaseId) {
        return q
          .from({ nodes: workspace.collections.nodes })
          .where(({ nodes }) => eq(nodes.id, ''));
      }
      return q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, relationIds));
    },
    [workspace.userId, relationField?.databaseId, relationIds]
  );

  const result = useMemo(() => {
    const related = relatedQuery.data.filter((node) => node.type === 'record') as unknown as LocalRecordNode[];
    const records = related.filter(
      (node) => node.databaseId === relationField?.databaseId
    );
    const aggregation = field.aggregation ?? 'count';
    if (aggregation === 'count') return records.length;

    const values = records
      .map((item) => displayValue(valueForField(item, field.targetFieldId)))
      .filter((value): value is string | number => value !== '');
    if (aggregation === 'show_original') return values.join(', ');

    const numbers = values
      .map((value) => (typeof value === 'number' ? value : Number(value)))
      .filter((value) => Number.isFinite(value));
    if (numbers.length === 0) return null;
    if (aggregation === 'sum') return numbers.reduce((sum, value) => sum + value, 0);
    if (aggregation === 'average') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    return aggregation === 'min' ? Math.min(...numbers) : Math.max(...numbers);
  }, [field.aggregation, field.targetFieldId, relatedQuery.data, relationField?.databaseId]);

  if (result === null || result === '') return <span>—</span>;
  return <span>{typeof result === 'number' && !Number.isInteger(result) ? result.toFixed(2) : result}</span>;
};
