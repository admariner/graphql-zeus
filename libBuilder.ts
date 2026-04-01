#!/bin/node
import * as fs from 'fs';
import * as path from 'path';

const removeImports = (s: string) => s.replace(/import\s(\n|\w|{|}|\s|,)*.*;(?! \/\/ keep)/gm, '');
const toTemplateString = (s: string) => '`' + s.replace(/\$\{/gm, '\\${').replace(/`/gm, '\\`') + '`';

const bundleFunctions = () => {
  const baseDirFunctions = path.join(process.cwd(), 'packages/graphql-zeus-core/TreeToTS/functions');
  const baseDir = path.join(baseDirFunctions, 'new');
  const directories = fs.readdirSync(baseDir);
  const allFunctions = directories
    .filter((d) => d !== 'mocks.ts')
    .filter((d) => !d.endsWith('spec.ts'))
    .map((d) => path.join(baseDir, d))
    .map((d) => {
      const content = fs.readFileSync(d).toString('utf-8');
      return removeImports(content).replace(/\\/gm, '\\\\').trim();
    });

  const subscriptionDir = path.join(baseDirFunctions, 'apiSubscription');
  const subscriptionFunctions = fs.readdirSync(subscriptionDir).map((file) => {
    // The key is the filename without its extension
    const key = path.basename(file, '.ts');
    const content = fs.readFileSync(path.join(subscriptionDir, file)).toString('utf-8');
    const code = removeImports(content).replace(/\\/gm, '\\\\').trim();
    return [key, code];
  });

  const sseDir = path.join(baseDirFunctions, 'apiSSESubscription');
  const sseFunctions = fs.readdirSync(sseDir).map((file) => {
    // The key is the filename without its extension
    const key = path.basename(file, '.ts');
    const content = fs.readFileSync(path.join(sseDir, file)).toString('utf-8');
    const code = removeImports(content).replace(/\\/gm, '\\\\').trim();
    return [key, code];
  });

  const content = `
  const baseTemplate = ${toTemplateString(allFunctions.join('\n\n'))};

  export const generateTypescriptFunctions = (options?: { deno?: boolean }): string => {
    const deno = options?.deno ?? false;
    if (!deno) return baseTemplate;

    let result = baseTemplate;

    // Replace fetchOptions type
    result = result.replace(
      'export type fetchOptions = Parameters<typeof fetch>;',
      'export type fetchOptions = [RequestInfo | URL, RequestInit?];',
    );

    // Replace chainOptions type
    result = result.replace(
      'export type chainOptions = [fetchOptions[0], fetchOptions[1] & { websocket?: websocketOptions }] | [fetchOptions[0]];',
      'export type chainOptions = [fetchOptions[0], (RequestInit & { headers?: Record<string, string> | Headers; websocket?: websocketOptions }) | undefined] | [fetchOptions[0]];',
    );

    // Replace GraphQLError class - add Object.setPrototypeOf and override toString
    result = result.replace(
      \`export class GraphQLError extends Error {
  constructor(public response: GraphQLResponse) {
    super(response.errors?.[0]?.message || 'GraphQL Response Error');
    console.error(response);
  }
  toString() {
    return 'GraphQL Response Error';
  }
}\`,
      \`export class GraphQLError extends Error {
  constructor(public response: GraphQLResponse) {
    super(response.errors?.[0]?.message || 'GraphQL Response Error');
    Object.setPrototypeOf(this, GraphQLError.prototype);
    console.error(response);
  }
  override toString() {
    return 'GraphQL Response Error';
  }
}\`,
    );

    return result;
  };

  export default generateTypescriptFunctions();

  export const subscriptionFunctions = {${subscriptionFunctions
    .map(([key, value]) => JSON.stringify(key) + ': ' + toTemplateString(value))
    .join(',\n')}};
  export const sseFunctions = {${sseFunctions
    .map(([key, value]) => JSON.stringify(key) + ': ' + toTemplateString(value))
    .join(',\n')}}`;

  fs.writeFileSync(path.join(baseDirFunctions, 'generated.ts'), content);
};

bundleFunctions();
