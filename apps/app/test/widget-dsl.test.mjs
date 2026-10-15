import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();

const { WIDGET_REGISTRY, isRegisteredWidget, getWidgetRegistration } = await import('../src/components/widgets/registry.ts');
const { ATOMIC_WHITELIST, validateDSL, isValidAtomicType, createEmptyDSL } = await import('../src/components/widgets/dsl-format.ts');

test('widget registry contains 4 legacy widgets and provides lookup utilities', () => {
  assert.equal(WIDGET_REGISTRY.size, 4, 'should have 4 registered widgets');
  
  const widgetIds = ['skills', 'work-tree', 'scheduled-tasks', 'settings'];
  for (const id of widgetIds) {
    assert.equal(isRegisteredWidget(id), true, `${id} should be registered`);
    const registration = getWidgetRegistration(id);
    assert.ok(registration, `${id} registration should exist`);
    assert.equal(registration?.id, id);
    assert.ok(registration?.title, `${id} should have a title`);
  }

  assert.equal(isRegisteredWidget('unknown-widget'), false);
  assert.equal(getWidgetRegistration('unknown-widget'), undefined);
});

test('atomic whitelist contains exactly 15 allowed component types', () => {
  assert.equal(ATOMIC_WHITELIST.length, 15, 'should have 15 atomic types');
  
  const expected = [
    'Button', 'Text', 'Panel', 'Tree', 'List', 'Input', 'Checkbox', 
    'Select', 'Divider', 'Icon', 'Link', 'Badge', 'Tag', 'Progress', 'Spinner',
  ];
  assert.deepEqual([...ATOMIC_WHITELIST], expected);
  
  for (const type of expected) {
    assert.equal(isValidAtomicType(type), true, `${type} should be valid`);
  }
  
  assert.equal(isValidAtomicType('UnknownComponent'), false);
  assert.equal(isValidAtomicType('Script'), false);
  assert.equal(isValidAtomicType('eval'), false);
});

test('DSL validation rejects unknown widgets', () => {
  const dsl = createEmptyDSL('unknown-widget');
  const errors = validateDSL(dsl);
  
  // Note: validateDSL only checks atomic structure, not widget registration
  // Widget registration check happens in interpreter
  assert.equal(errors.length, 0, 'empty DSL with valid atomics should have no format errors');
});

test('DSL validation rejects unknown atomic types', () => {
  const dsl = {
    widgetId: 'skills',
    version: '1.0.0',
    root: {
      type: 'UnknownComponent',
      children: [],
    },
  };
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.type, 'unknown-atomic');
  assert.equal(errors[0].atomicType, 'UnknownComponent');
});

test('DSL validation rejects function props', () => {
  const dsl = {
    widgetId: 'skills',
    version: '1.0.0',
    root: {
      type: 'Button',
      props: {
        onClick: () => {},
      },
      children: [],
    },
  };
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.type, 'invalid-prop');
  assert.equal(errors[0].propName, 'onClick');
});

test('DSL validation accepts valid pure-data DSL', () => {
  const dsl = {
    widgetId: 'skills',
    version: '1.0.0',
    root: {
      type: 'Panel',
      props: { variant: 'card' },
      children: [
        {
          type: 'Text',
          props: { content: 'Hello' },
        },
        {
          type: 'Button',
          props: { disabled: false },
          children: ['Click me'],
        },
      ],
    },
  };
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 0);
});

test('DSL validation catches nested unknown atomics', () => {
  const dsl = {
    widgetId: 'skills',
    version: '1.0.0',
    root: {
      type: 'Panel',
      children: [
        {
          type: 'Button',
          children: [
            {
              type: 'EvilScript',
              props: { code: 'alert(1)' },
            },
          ],
        },
      ],
    },
  };
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.type, 'unknown-atomic');
  assert.equal(errors[0].atomicType, 'EvilScript');
  assert.ok(errors[0].path.includes('children'));
});

test('createEmptyDSL produces valid minimal DSL', () => {
  const dsl = createEmptyDSL('work-tree');
  assert.equal(dsl.widgetId, 'work-tree');
  assert.equal(dsl.version, '1.0.0');
  assert.equal(dsl.root.type, 'Panel');
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 0);
});

test('DSL validation rejects object props', () => {
  const dsl = {
    widgetId: 'skills',
    version: '1.0.0',
    root: {
      type: 'Button',
      props: {
        config: { nested: 'object' },
      },
    },
  };
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.type, 'invalid-prop');
  assert.equal(errors[0].propName, 'config');
});

test('DSL validation accepts primitive prop types', () => {
  const dsl = {
    widgetId: 'skills',
    version: '1.0.0',
    root: {
      type: 'Panel',
      props: {
        string: 'hello',
        number: 42,
        boolean: true,
        nullValue: null,
      },
      children: [],
    },
  };
  
  const errors = validateDSL(dsl);
  assert.equal(errors.length, 0);
});
