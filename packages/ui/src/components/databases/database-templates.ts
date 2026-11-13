import {
  LocalDatabaseNode,
  LocalRecordNode,
  LocalDatabaseViewNode,
} from '@colanode/client/types';
import {
  DatabaseViewFilterAttributes,
  FieldAttributes,
  FieldType,
  FieldValue,
  SelectOptionAttributes,
  generateFractionalIndex,
  generateId,
  IdType,
} from '@colanode/core';

export type DatabaseTemplateFieldSpec = {
  key: string;
  name: string;
  type: FieldType;
  options?: readonly { name: string; color: string }[];
};

export type DatabaseTemplateRecordSpec = {
  name: string;
  values: Record<string, string | number | boolean | readonly string[]>;
};

export type DatabaseTemplateViewSpec = {
  name: string;
  layout: LocalDatabaseViewNode['layout'];
  groupBy?: string;
  filter?: {
    field: string;
    operator: string;
    value?: string | number | boolean | readonly string[];
  };
};

export type DatabaseTemplate = {
  id: string;
  name: string;
  description: string;
  fields: readonly DatabaseTemplateFieldSpec[];
  views: readonly DatabaseTemplateViewSpec[];
  records: readonly DatabaseTemplateRecordSpec[];
};

const bloggingStatuses = [
  { name: 'Backlog', color: 'gray' },
  { name: 'In Progress', color: 'blue' },
  { name: 'Review', color: 'yellow' },
  { name: 'Published', color: 'green' },
] as const;

const bloggingTags = [
  { name: 'SEO', color: 'blue' },
  { name: 'Product', color: 'green' },
  { name: 'Social', color: 'purple' },
] as const;

const snippetStatuses = [
  { name: 'Inbox', color: 'gray' },
  { name: 'Testing', color: 'orange' },
  { name: 'Ready', color: 'green' },
  { name: 'Archived', color: 'purple' },
] as const;

/**
 * Templates are descriptors, not seeded databases. The creator below turns
 * any descriptor into ordinary database, view, field, and record nodes so
 * future templates can be added without another hardcoded creation path.
 */
export const DATABASE_TEMPLATES: readonly DatabaseTemplate[] = [
  {
    id: 'blogging-team',
    name: 'Blogging Team',
    description: 'A content workflow with status, planning, and publish views.',
    fields: [
      { key: 'status', name: 'Status', type: 'select', options: bloggingStatuses },
      { key: 'owner', name: 'Owner', type: 'text' },
      { key: 'publishDate', name: 'Publish Date', type: 'date' },
      { key: 'brief', name: 'Brief', type: 'text' },
      { key: 'tags', name: 'Tags', type: 'multi_select', options: bloggingTags },
    ],
    views: [
      { name: 'Workflow', layout: 'board', groupBy: 'status' },
      {
        name: 'Active work',
        layout: 'table',
        filter: {
          field: 'status',
          operator: 'is_in',
          value: ['backlog', 'in-progress', 'review'],
        },
      },
      { name: 'Publishing calendar', layout: 'calendar' },
    ],
    records: [
      {
        name: 'Launch story',
        values: {
          status: 'in-progress',
          owner: 'Editorial team',
          publishDate: '2026-11-18',
          brief: 'Explain the launch in a concise, customer-facing story.',
          tags: ['product'],
        },
      },
      {
        name: 'SEO refresh',
        values: {
          status: 'review',
          owner: 'SEO team',
          publishDate: '2026-11-20',
          brief: 'Refresh the evergreen guide and validate the search intent.',
          tags: ['seo'],
        },
      },
      {
        name: 'Community roundup',
        values: {
          status: 'published',
          owner: 'Social team',
          publishDate: '2026-11-10',
          brief: 'Collect the strongest community highlights for the weekly post.',
          tags: ['social'],
        },
      },
    ],
  },
  {
    id: 'php-snippet-inventory',
    name: 'PHP Snippet Inventory',
    description: 'A reusable code inventory with testing and readiness workflow.',
    fields: [
      { key: 'status', name: 'Status', type: 'select', options: snippetStatuses },
      { key: 'category', name: 'Category', type: 'text' },
      { key: 'snippet', name: 'Snippet', type: 'text' },
      { key: 'source', name: 'Source URL', type: 'url' },
      { key: 'tags', name: 'Tags', type: 'multi_select', options: bloggingTags },
    ],
    views: [
      { name: 'Readiness', layout: 'board', groupBy: 'status' },
      {
        name: 'Needs testing',
        layout: 'table',
        filter: { field: 'status', operator: 'is_in', value: ['inbox', 'testing'] },
      },
    ],
    records: [
      {
        name: 'Safe redirect helper',
        values: {
          status: 'ready',
          category: 'WordPress',
          snippet: 'wp_safe_redirect($url); exit;',
          source: 'https://developer.wordpress.org/reference/functions/wp_safe_redirect/',
          tags: ['product'],
        },
      },
      {
        name: 'Nonce check',
        values: {
          status: 'testing',
          category: 'Security',
          snippet: 'check_admin_referer($action);',
          source: 'https://developer.wordpress.org/reference/functions/check_admin_referer/',
          tags: ['seo'],
        },
      },
    ],
  },
];

type TemplateNode = LocalDatabaseNode | LocalDatabaseViewNode | LocalRecordNode;

const createOptions = (
  options: readonly { name: string; color: string }[] | undefined,
  indexStart: string | null = null
): Record<string, SelectOptionAttributes> | undefined => {
  if (!options || options.length === 0) return undefined;

  let previous = indexStart;
  return options.reduce<Record<string, SelectOptionAttributes>>((result, option) => {
    const id = option.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const index = generateFractionalIndex(previous, null);
    result[id] = { id, name: option.name, color: option.color, index };
    previous = index;
    return result;
  }, {});
};

const createField = (
  spec: DatabaseTemplateFieldSpec,
  index: string
): FieldAttributes => {
  const fieldId = generateId(IdType.Field);
  const base = { id: fieldId, type: spec.type, name: spec.name, index } as FieldAttributes;
  if (base.type === 'select' || base.type === 'multi_select') {
    return { ...base, options: createOptions(spec.options) } as FieldAttributes;
  }
  return base;
};

const createFieldValue = (
  field: FieldAttributes,
  value: string | number | boolean | readonly string[] | undefined
): FieldValue | undefined => {
  if (value === undefined) return undefined;
  switch (field.type) {
    case 'boolean':
      return { type: 'boolean', value: Boolean(value) };
    case 'number':
      return { type: 'number', value: Number(value) };
    case 'multi_select':
      return { type: 'string_array', value: [...(value as readonly string[])] };
    case 'text':
      return { type: 'text', value: String(value) };
    default:
      return { type: 'string', value: String(value) };
  }
};

export const createDatabaseFromTemplate = ({
  template,
  name,
  parentId,
  userId,
}: {
  template: DatabaseTemplate;
  name?: string;
  parentId: string;
  userId: string;
}): TemplateNode[] => {
  const now = new Date().toISOString();
  const databaseId = generateId(IdType.Database);
  let previousFieldIndex: string | null = null;
  const fields = template.fields.reduce<Record<string, FieldAttributes>>((result, spec) => {
    const index = generateFractionalIndex(previousFieldIndex, null);
    const field = createField(spec, index);
    previousFieldIndex = index;
    result[field.id] = field;
    return result;
  }, {});
  const fieldByKey = new Map(
    template.fields.map((spec) => [spec.key, Object.values(fields).find((field) => field.name === spec.name)!])
  );

  const database: LocalDatabaseNode = {
    id: databaseId,
    type: 'database',
    name: name ?? template.name,
    parentId,
    fields,
    rootId: parentId,
    createdAt: now,
    createdBy: userId,
    updatedAt: null,
    updatedBy: null,
    localRevision: '0',
    serverRevision: '0',
  };

  const nodes: TemplateNode[] = [database];
  let previousViewIndex: string | null = null;
  for (const viewSpec of template.views) {
    const viewId = generateId(IdType.DatabaseView);
    const index = generateFractionalIndex(previousViewIndex, null);
    previousViewIndex = index;
    const filterField = viewSpec.filter ? fieldByKey.get(viewSpec.filter.field) : undefined;
    const rawFilterValue = viewSpec.filter?.value;
    const filterValue = (Array.isArray(rawFilterValue)
      ? [...rawFilterValue]
      : rawFilterValue) as string | number | boolean | string[] | undefined;
    const filter: DatabaseViewFilterAttributes | undefined =
      filterField && viewSpec.filter
        ? {
            id: filterField.id,
            fieldId: filterField.id,
            type: 'field',
            operator: viewSpec.filter.operator,
            value: filterValue,
          }
        : undefined;
    nodes.push({
      id: viewId,
      type: 'database_view',
      name: viewSpec.name,
      parentId: databaseId,
      layout: viewSpec.layout,
      index,
      rootId: databaseId,
      groupBy: viewSpec.groupBy ? fieldByKey.get(viewSpec.groupBy)?.id : undefined,
      filters: filter ? { [filter.id]: filter } : undefined,
      createdAt: now,
      createdBy: userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    });
  }

  for (const recordSpec of template.records) {
    const recordFields: Record<string, FieldValue> = {};
    for (const [key, value] of Object.entries(recordSpec.values)) {
      const field = fieldByKey.get(key);
      const fieldValue = createFieldValue(field!, value);
      if (field && fieldValue) recordFields[field.id] = fieldValue;
    }
    nodes.push({
      id: generateId(IdType.Record),
      type: 'record',
      parentId: databaseId,
      rootId: parentId,
      databaseId,
      name: recordSpec.name,
      fields: recordFields,
      createdAt: now,
      createdBy: userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    });
  }

  return nodes;
};

export const getDatabaseTemplate = (id: string) =>
  DATABASE_TEMPLATES.find((template) => template.id === id) ?? null;
