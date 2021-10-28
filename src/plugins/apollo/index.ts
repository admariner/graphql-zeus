import { OperationType, ParserTree } from 'graphql-js-tree';

const pluginApolloOps = ({ queryName, operation }: { queryName: string; operation: OperationType | 'LazyQuery' }) => {
  const capitalized = operation[0].toUpperCase() + operation.slice(1);
  const zeusOperation = operation === 'LazyQuery' ? OperationType.query : operation;
  let returnedType = '';
  if (operation === 'LazyQuery') {
    returnedType = `QueryTuple<TResult, TVariables>;`;
  }
  if (operation === OperationType.mutation) {
    returnedType = `MutationTuple<TResult, TVariables>;`;
  }
  if (operation === OperationType.query) {
    returnedType = `QueryResult<TResult, TVariables>;`;
  }
  if (operation === OperationType.subscription) {
    returnedType = `{
  variables: TVariables | undefined;
  loading: boolean;
  data?: TResult | undefined;
  error?: ApolloError | undefined;
};`;
  }
  return {
    queryName,
    operation,
    ts: `export function useTyped${capitalized}<Z>(
  ${operation}: Z | ValueTypes['${queryName}'],
  options?: ${capitalized}HookOptions<InputType<GraphQLTypes['${queryName}'], Z>>,
) {
  return use${capitalized}<InputType<GraphQLTypes['${queryName}'], Z>>(gql(Zeus.${zeusOperation}(${operation})), options);
}`,
    js: {
      code: `export function useTyped${capitalized}(${operation}, options) {
  return use${capitalized}(gql(Zeus.${zeusOperation}(${operation})), options);
}
`,
      definitions: `export declare function useTyped${capitalized}<TData,
  TVariables = OperationVariables,
  TResult = InputType<GraphQLTypes['${queryName}'], TData>
>(
  ${operation}: TData | ValueTypes['${queryName}'],
  options?: ${capitalized}HookOptions<TResult>,
): ${returnedType}`,
    },
  };
};

export const pluginApollo = ({ tree, esModule }: { tree: ParserTree; esModule?: boolean }) => {
  const operationNodes = tree.nodes.filter((n) => n.type.operations);
  const opsFunctions = operationNodes.flatMap((n) =>
    n.type.operations!.map((o) => pluginApolloOps({ queryName: n.name, operation: o })),
  );
  for (const [index, o] of opsFunctions.entries()) {
    if (o.operation === OperationType.query) {
      opsFunctions.splice(index + 1, 0, pluginApolloOps({ queryName: o.queryName, operation: 'LazyQuery' }));
      break;
    }
  }
  const o = opsFunctions.reduce<Pick<ReturnType<typeof pluginApolloOps>, 'js' | 'ts'>>(
    (a, b) => {
      a.ts = [a.ts, b.ts].join('\n');
      a.js.code = [a.js.code, b.js.code].join('\n');
      a.js.definitions = [a.js.definitions, b.js.definitions].join('\n');
      return a;
    },
    { ts: '', js: { code: '', definitions: '' } },
  );
  const capitalizedOps = opsFunctions.map((o) => o.operation[0].toUpperCase() + o.operation.slice(1));
  const jsDefsImports: string[] = [];
  if (capitalizedOps.includes('LazyQuery')) {
    jsDefsImports.push('QueryTuple');
  }
  if (capitalizedOps.includes('Query')) {
    jsDefsImports.push('QueryResult');
  }
  if (capitalizedOps.includes('Mutation')) {
    jsDefsImports.push('MutationTuple');
  }
  return {
    ts: `/* eslint-disable */

import { Zeus, GraphQLTypes, InputType, ValueTypes } from './index${esModule ? '.js' : ''}';
import { gql, ${capitalizedOps.map((o) => `use${o}`).join(', ')} } from '@apollo/client';
import type { ${capitalizedOps.map((o) => `${o}HookOptions`).join(', ')} } from '@apollo/client';

${o.ts}
`,
    js: {
      code: `/* eslint-disable */
import { Zeus } from './index';
import { gql, ${capitalizedOps.map((o) => `use${o}`).join(', ')} } from '@apollo/client';

${o.js.code}
`,
      definitions: `/* eslint-disable */
import type { GraphQLTypes, InputType, ValueTypes } from './index';
import type { ${jsDefsImports.join(', ')}, ${capitalizedOps
        .map((o) => `${o}HookOptions`)
        .join(', ')} } from '@apollo/client';

${o.js.definitions}
`,
    },
  };
};